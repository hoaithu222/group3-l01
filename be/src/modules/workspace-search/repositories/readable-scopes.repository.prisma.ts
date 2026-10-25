import { prisma } from "../../../infrastructure/database";
import type { ReadableChannel, ReadableConversation } from "../entities/search.interface";
import type { IReadableScopesRepository } from "./readable-scopes.repository.interface";

export class PrismaReadableScopesRepository implements IReadableScopesRepository {
  async listChannels(workspaceId: string, ids?: readonly string[]): Promise<ReadableChannel[]> {
    if (ids && ids.length === 0) return [];
    const rows = await prisma.channel.findMany({
      where: { workspaceId, ...(ids ? { id: { in: [...ids] } } : {}) },
      select: {
        id: true,
        name: true,
        normalizedName: true,
        type: true,
        visibility: true,
        status: true,
        memberCount: true,
        lastMessageAt: true,
        createdAt: true,
      },
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      normalizedName: c.normalizedName,
      type: c.type,
      visibility: c.visibility,
      status: c.status,
      memberCount: c.memberCount,
      lastActivityAt: c.lastMessageAt ?? c.createdAt,
    }));
  }

  async grantedChannelIds(workspaceId: string, userId: string, coveringRoles: readonly string[]): Promise<Set<string>> {
    const rows = await prisma.channelGrant.findMany({
      where: {
        workspaceId,
        ...(coveringRoles.length > 0
          ? { OR: [{ userId, source: "DIRECT" as const }, { source: "ROLE" as const, roleRef: { in: [...coveringRoles] } }] }
          : { userId, source: "DIRECT" as const }),
      },
      select: { channelId: true },
    });
    return new Set(rows.map((r) => r.channelId));
  }

  async joinedChannelIds(workspaceId: string, userId: string): Promise<Set<string>> {
    const rows = await prisma.channelMembership.findMany({ where: { workspaceId, userId }, select: { channelId: true } });
    return new Set(rows.map((r) => r.channelId));
  }

  async listGroupConversations(workspaceId: string, userId: string, ids?: readonly string[]): Promise<ReadableConversation[]> {
    if (ids && ids.length === 0) return [];
    const members = await prisma.conversationMember.findMany({
      where: {
        userId,
        status: "ACTIVE",
        kind: "GROUP",
        workspaceId,
        ...(ids ? { conversationId: { in: [...ids] } } : {}),
      },
      select: { conversationId: true, hiddenBeforeSeq: true },
    });
    return this.joinConversations(members.map((m) => ({ ...m, peerUserId: null })), ["ACTIVE", "ARCHIVED"]);
  }

  async listDirectConversations(userId: string, ids?: readonly string[]): Promise<ReadableConversation[]> {
    if (ids && ids.length === 0) return [];
    const members = await prisma.conversationMember.findMany({
      where: { userId, status: "ACTIVE", kind: "DIRECT", ...(ids ? { conversationId: { in: [...ids] } } : {}) },
      select: { conversationId: true, hiddenBeforeSeq: true, peerUserId: true },
    });
    return this.joinConversations(members, ["ACTIVE"]);
  }

  async activeMemberIds(workspaceId: string, userIds: readonly string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const now = Date.now();
    const rows = await prisma.workspaceMembership.findMany({
      where: { workspaceId, status: "ACTIVE", userId: { in: [...userIds] } },
      select: { userId: true, role: true, expiresAt: true },
    });
    return new Set(rows.filter((r) => !(r.role === "GUEST" && r.expiresAt && r.expiresAt.getTime() <= now)).map((r) => r.userId));
  }

  private async joinConversations(
    members: { conversationId: string; hiddenBeforeSeq: number; peerUserId: string | null }[],
    statuses: ("ACTIVE" | "ARCHIVED")[]
  ): Promise<ReadableConversation[]> {
    if (members.length === 0) return [];
    const conversations = await prisma.conversation.findMany({
      where: { id: { in: members.map((m) => m.conversationId) }, status: { in: statuses } },
      select: { id: true, kind: true, title: true, lastMessageAt: true, activityAt: true },
    });
    const byId = new Map(members.map((m) => [m.conversationId, m]));
    return conversations.flatMap((c) => {
      const m = byId.get(c.id);
      if (!m) return [];
      return [
        {
          id: c.id,
          kind: c.kind,
          title: c.title,
          peerUserId: c.kind === "DIRECT" ? m.peerUserId : null,
          hiddenBeforeSeq: m.hiddenBeforeSeq,
          lastActivityAt: c.lastMessageAt ?? c.activityAt,
        },
      ];
    });
  }
}
