import { prisma } from "../../../infrastructure/database";
import { decodeCursor } from "../../../core/utils/cursor";
import type {
  ChannelBrief,
  IInvitationRepository,
  InvitationListParams,
  UserBrief,
  WorkspaceBrief,
} from "./invitation.repository.interface";
import type { InvitationStatusValue, WorkspaceInvitation } from "../entities/invitation.interface";

type InvitationRecord = Awaited<ReturnType<typeof prisma.workspaceInvitation.findFirstOrThrow>>;

export function mapInvitation(record: InvitationRecord): WorkspaceInvitation {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    email: record.email,
    normalizedEmail: record.normalizedEmail,
    role: record.role === "GUEST" ? "GUEST" : "MEMBER",
    guestChannelIds: record.guestChannelIds,
    guestDays: record.guestDays,
    message: record.message,
    tokenHash: record.tokenHash,
    invitedBy: record.invitedBy,
    status: record.status,
    pendingKey: record.pendingKey,
    expiresAt: record.expiresAt,
    lastSentAt: record.lastSentAt,
    sendCount: record.sendCount,
    acceptedBy: record.acceptedBy,
    acceptedAt: record.acceptedAt,
    revokedBy: record.revokedBy,
    revokedAt: record.revokedAt,
    createdAt: record.createdAt,
  };
}

export class PrismaInvitationRepository implements IInvitationRepository {
  async findById(id: string): Promise<WorkspaceInvitation | null> {
    const record = await prisma.workspaceInvitation.findUnique({ where: { id } });
    return record ? mapInvitation(record) : null;
  }

  async findByTokenHash(tokenHash: string): Promise<WorkspaceInvitation | null> {
    const record = await prisma.workspaceInvitation.findUnique({ where: { tokenHash } });
    return record ? mapInvitation(record) : null;
  }

  async listByWorkspace(
    workspaceId: string,
    params: InvitationListParams
  ): Promise<{ data: WorkspaceInvitation[]; hasMore: boolean }> {
    const decoded = params.cursor ? decodeCursor(params.cursor) : null;
    const records = await prisma.workspaceInvitation.findMany({
      where: {
        workspaceId,
        ...(params.status && { status: params.status }),
        ...(decoded && {
          OR: [{ createdAt: { lt: decoded.at } }, { createdAt: decoded.at, id: { lt: decoded.id } }],
        }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: params.limit + 1,
    });
    const hasMore = records.length > params.limit;
    const page = hasMore ? records.slice(0, params.limit) : records;
    return { data: page.map(mapInvitation), hasMore };
  }

  async findWorkspace(workspaceId: string): Promise<WorkspaceBrief | null> {
    const w = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!w) return null;
    return {
      id: w.id,
      name: w.name,
      avatarAssetId: w.avatarAssetId ?? null,
      status: w.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
      joinPolicy: w.joinPolicy === "APPROVAL" ? "APPROVAL" : "OPEN",
      guestPolicy: w.guestPolicy,
      defaultChannelId: w.defaultChannelId,
    };
  }

  async findUserById(userId: string): Promise<UserBrief | null> {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, emailVerified: true },
    });
    return u ?? null;
  }

  async findUsersByEmails(emails: string[]): Promise<UserBrief[]> {
    if (emails.length === 0) return [];
    return prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true, name: true, emailVerified: true },
    });
  }

  async countActiveGuests(workspaceId: string): Promise<number> {
    return prisma.workspaceMembership.count({ where: { workspaceId, role: "GUEST", status: "ACTIVE" } });
  }

  async countPendingGuestInvitations(workspaceId: string, now: Date): Promise<number> {
    return prisma.workspaceInvitation.count({
      where: { workspaceId, role: "GUEST", status: "PENDING", expiresAt: { gt: now } },
    });
  }

  async listChannels(workspaceId: string, channelIds: string[]): Promise<ChannelBrief[]> {
    if (channelIds.length === 0) return [];
    const records = await prisma.channel.findMany({
      where: { id: { in: channelIds }, workspaceId },
      select: { id: true, name: true, visibility: true, status: true },
    });
    return records.map((c) => ({
      id: c.id,
      name: c.name,
      visibility: c.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
      status: c.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
    }));
  }

  async listAllByWorkspace(workspaceId: string, status?: InvitationStatusValue): Promise<WorkspaceInvitation[]> {
    const records = await prisma.workspaceInvitation.findMany({
      where: { workspaceId, ...(status && { status }) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 500,
    });
    return records.map(mapInvitation);
  }

  async listPendingByEmail(normalizedEmail: string, now: Date): Promise<WorkspaceInvitation[]> {
    const records = await prisma.workspaceInvitation.findMany({
      where: { normalizedEmail, status: "PENDING", expiresAt: { gt: now } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    });
    return records.map(mapInvitation);
  }

  async countCreatedSince(workspaceId: string, since: Date): Promise<number> {
    return prisma.workspaceInvitation.count({ where: { workspaceId, createdAt: { gte: since } } });
  }

  async findPendingFor(workspaceId: string, normalizedEmail: string): Promise<WorkspaceInvitation | null> {
    const record = await prisma.workspaceInvitation.findUnique({
      where: { pendingKey: `${workspaceId}:${normalizedEmail}` },
    });
    return record && record.status === "PENDING" ? mapInvitation(record) : null;
  }
}
