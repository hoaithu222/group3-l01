import { prisma } from "../../../infrastructure/database";
import type { ReminderTargetValue } from "../entities/wallet.interface";
import type { IWalletDirectory, WalletMemberRole } from "./wallet-directory.interface";

export class PrismaWalletDirectory implements IWalletDirectory {
  async activeRoles(workspaceId: string, userIds: string[]): Promise<Map<string, WalletMemberRole>> {
    if (userIds.length === 0) return new Map();
    const rows = await prisma.workspaceMembership.findMany({
      where: { workspaceId, userId: { in: userIds }, status: "ACTIVE" },
      select: { userId: true, role: true },
    });
    return new Map(rows.map((r) => [r.userId, r.role as WalletMemberRole]));
  }

  async isWorkspaceActive(workspaceId: string): Promise<boolean> {
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { status: true } });
    return ws?.status === "ACTIVE";
  }

  async isValidReminderTarget(
    workspaceId: string,
    type: Exclude<ReminderTargetValue, "NONE">,
    targetId: string
  ): Promise<boolean> {
    if (type === "CONVERSATION") {
      const c = await prisma.conversation.findFirst({
        where: { id: targetId, workspaceId, kind: "GROUP", status: "ACTIVE" },
        select: { id: true },
      });
      return c !== null;
    }
    const ch = await prisma.channel.findFirst({
      where: { id: targetId, workspaceId, type: "TEXT", status: "ACTIVE" },
      select: { id: true },
    });
    return ch !== null;
  }

  async publicChannelName(workspaceId: string, channelId: string): Promise<string | null> {
    const ch = await prisma.channel.findFirst({
      where: { id: channelId, workspaceId, visibility: "PUBLIC" },
      select: { name: true },
    });
    return ch?.name ?? null;
  }

  async workspaceName(workspaceId: string): Promise<string | null> {
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } });
    return ws?.name ?? null;
  }

  async isAssetReady(assetId: string, ownerId: string): Promise<boolean> {
    const asset = await prisma.asset.findFirst({ where: { id: assetId, ownerId, status: "READY" }, select: { id: true } });
    return asset !== null;
  }

  async listWalletMemberIds(workspaceId: string): Promise<string[]> {
    const rows = await prisma.workspaceMembership.findMany({
      where: { workspaceId, status: "ACTIVE", role: { not: "GUEST" } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  async notificationExists(dedupeKey: string): Promise<boolean> {
    const n = await prisma.notification.findUnique({ where: { dedupeKey }, select: { id: true } });
    return n !== null;
  }

  async userNames(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}
