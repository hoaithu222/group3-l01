import { prisma } from "../../../infrastructure/database";
import { ROLE_LIST } from "../../../core/constants/roles";
import { roleHasPermission } from "../../../core/constants/permissions";
import type {
  DirectoryChannel,
  DirectoryConversation,
  DirectoryUser,
  DirectoryWorkspace,
  IModerationDirectory,
} from "./moderation-directory.repository.interface";

const unique = (ids: string[]): string[] => Array.from(new Set(ids));

export class PrismaModerationDirectory implements IModerationDirectory {
  async findUsers(ids: string[]): Promise<DirectoryUser[]> {
    const list = unique(ids);
    if (list.length === 0) return [];
    return prisma.user.findMany({ where: { id: { in: list } }, select: { id: true, name: true } });
  }

  async findWorkspaces(ids: string[]): Promise<DirectoryWorkspace[]> {
    const list = unique(ids);
    if (list.length === 0) return [];
    return prisma.workspace.findMany({ where: { id: { in: list } }, select: { id: true, name: true } });
  }

  async findChannels(ids: string[]): Promise<DirectoryChannel[]> {
    const list = unique(ids);
    if (list.length === 0) return [];
    return prisma.channel.findMany({
      where: { id: { in: list } },
      select: { id: true, name: true, workspaceId: true, visibility: true, status: true },
    });
  }

  async findConversations(ids: string[]): Promise<DirectoryConversation[]> {
    const list = unique(ids);
    if (list.length === 0) return [];
    return prisma.conversation.findMany({
      where: { id: { in: list } },
      select: { id: true, kind: true, title: true, workspaceId: true, status: true },
    });
  }

  async isActiveWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
    const row = await prisma.workspaceMembership.findFirst({ where: { workspaceId, userId, status: "ACTIVE" }, select: { id: true } });
    return row !== null;
  }

  async listWorkspaceAdminIds(workspaceId: string): Promise<string[]> {
    const rows = await prisma.workspaceMembership.findMany({
      where: { workspaceId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] } },
      select: { userId: true },
    });
    return unique(rows.map((r) => r.userId));
  }

  async findWorkspaceOwnerId(workspaceId: string): Promise<string | null> {
    const row = await prisma.workspaceMembership.findFirst({
      where: { workspaceId, status: "ACTIVE", role: "OWNER" },
      select: { userId: true },
    });
    return row?.userId ?? null;
  }

  async listChannelManagerIds(channelId: string): Promise<string[]> {
    const rows = await prisma.channelGrant.findMany({ where: { channelId, level: "MANAGER" }, select: { userId: true } });
    // MANAGER luôn là grant DIRECT (role grant chỉ cấp MEMBER — p3-04); `userId` null chỉ ở grant ROLE.
    return unique(rows.flatMap((r) => (r.userId ? [r.userId] : [])));
  }

  async listConversationAdminIds(conversationId: string): Promise<string[]> {
    const rows = await prisma.conversationMember.findMany({
      where: { conversationId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] } },
      select: { userId: true },
    });
    return unique(rows.map((r) => r.userId));
  }

  async listConversationMemberIds(conversationId: string): Promise<string[]> {
    const rows = await prisma.conversationMember.findMany({ where: { conversationId, status: "ACTIVE" }, select: { userId: true } });
    return unique(rows.map((r) => r.userId));
  }

  async listPlatformModeratorIds(limit: number): Promise<string[]> {
    // Vai trò hệ thống có `moderation:view` (ADMIN, MANAGER — theo ma trận `ROLE_PERMISSIONS`, không hardcode danh sách vai trò).
    const roles = ROLE_LIST.filter((role) => roleHasPermission(role, "moderation:view"));
    if (roles.length === 0) return [];
    const rows = await prisma.user.findMany({ where: { role: { in: roles }, status: "ACTIVE" }, select: { id: true }, take: limit });
    return rows.map((r) => r.id);
  }

  async listManagedPrivateChannelIds(userId: string, workspaceId: string): Promise<string[]> {
    const grants = await prisma.channelGrant.findMany({ where: { userId, workspaceId, level: "MANAGER" }, select: { channelId: true } });
    if (grants.length === 0) return [];
    const channels = await prisma.channel.findMany({
      where: { id: { in: unique(grants.map((g) => g.channelId)) }, visibility: "PRIVATE" },
      select: { id: true },
    });
    return channels.map((c) => c.id);
  }

  async listAdministeredGroupIds(userId: string, workspaceId: string): Promise<string[]> {
    const rows = await prisma.conversationMember.findMany({
      where: { userId, workspaceId, kind: "GROUP", status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] } },
      select: { conversationId: true },
    });
    return unique(rows.map((r) => r.conversationId));
  }

  async notificationExists(dedupeKey: string): Promise<boolean> {
    const row = await prisma.notification.findUnique({ where: { dedupeKey }, select: { id: true } });
    return row !== null;
  }
}
