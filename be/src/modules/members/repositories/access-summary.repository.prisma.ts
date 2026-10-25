import { prisma } from "../../../infrastructure/database";
import type { AccessCounts, IAccessSummaryRepository } from "./access-summary.repository.interface";

export class PrismaAccessSummaryRepository implements IAccessSummaryRepository {
  async counts(workspaceId: string, now: Date, expiringBefore: Date): Promise<AccessCounts> {
    const [
      activeMembers,
      bannedMembers,
      activeInviteLinks,
      activeGuests,
      guestsExpiringSoon,
      pendingRequests,
      pendingInvitations,
      privateChannels,
      roleGrants,
    ] = await Promise.all([
      prisma.workspaceMembership.count({ where: { workspaceId, status: "ACTIVE" } }),
      prisma.workspaceMembership.count({ where: { workspaceId, status: "BANNED" } }),
      // `revokedAt` có thể VẮNG MẶT ở link cũ (Prisma+Mongo không khớp `{ revokedAt: null }` với field chưa từng ghi) — khớp cả hai dạng như `claimLink`.
      prisma.inviteLink.count({
        where: {
          workspaceId,
          expiresAt: { gt: now },
          remainingUses: { gt: 0 },
          OR: [{ revokedAt: null }, { revokedAt: { isSet: false } }],
        },
      }),
      prisma.workspaceMembership.count({ where: { workspaceId, role: "GUEST", status: "ACTIVE" } }),
      prisma.workspaceMembership.count({
        where: { workspaceId, role: "GUEST", status: "ACTIVE", expiresAt: { gt: now, lte: expiringBefore } },
      }),
      prisma.workspaceMembership.count({ where: { workspaceId, status: "PENDING" } }),
      prisma.workspaceInvitation.count({ where: { workspaceId, status: "PENDING", expiresAt: { gt: now } } }),
      prisma.channel.count({ where: { workspaceId, visibility: "PRIVATE", status: "ACTIVE" } }),
      prisma.channelGrant.findMany({ where: { workspaceId, source: "ROLE" }, select: { channelId: true } }),
    ]);
    const roleGrantChannelIds = [...new Set(roleGrants.map((g) => g.channelId))];
    const withRoleGrant =
      roleGrantChannelIds.length === 0
        ? 0
        : await prisma.channel.count({ where: { id: { in: roleGrantChannelIds }, visibility: "PRIVATE", status: "ACTIVE" } });
    return {
      activeMembers,
      bannedMembers,
      activeInviteLinks,
      activeGuests,
      guestsExpiringSoon,
      pendingRequests,
      pendingInvitations,
      privateChannels,
      privateChannelsWithRoleGrant: withRoleGrant,
    };
  }
}
