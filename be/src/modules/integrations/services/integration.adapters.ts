import type { IntegrationTargetScopeType } from "../../../core/constants/integration";
import { permissionService } from "../../../core/permission";
import type { AuthUser } from "../../../core/types/express";
import { prisma, withTransaction } from "../../../infrastructure/database";
import { emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { createSystemConfigService } from "../../system-config/public";
import { notify } from "../../notifications/public";
import type {
  IIntegrationAccess,
  IIntegrationDirectory,
  IIntegrationEmitter,
  IIntegrationNotifier,
  IntegrationErrorNotice,
  IntegrationUpdatedPayload,
  IProviderConfigStore,
  TargetChannelInfo,
  TargetConversationInfo,
  WorkspaceAccess,
  WorkspaceInfo,
} from "./integration.ports";
import { INTEGRATION_ERROR_TYPE } from "./integration-notification-types";

/** Người dùng "rỗng" để hỏi quyền theo id (worker không có phiên) — cùng cách `notifications`/`mentions` đã dùng. */
const asUser = (userId: string): AuthUser => ({ id: userId, email: "" });

/** Đọc CHỈ-ĐỌC dữ kiện kênh/nhóm chat/workspace/thành viên của module khác (không ghi, không tự suy quyền). */
export class PrismaIntegrationDirectory implements IIntegrationDirectory {
  async getChannel(channelId: string): Promise<TargetChannelInfo | null> {
    const row = await prisma.channel.findUnique({ where: { id: channelId }, select: { id: true, workspaceId: true, name: true, type: true, visibility: true, status: true } });
    return row ? { ...row } : null;
  }

  async getConversation(conversationId: string): Promise<TargetConversationInfo | null> {
    const row = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { id: true, workspaceId: true, kind: true, title: true, status: true } });
    return row ? { ...row } : null;
  }

  async getWorkspace(workspaceId: string): Promise<WorkspaceInfo | null> {
    const row = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, name: true, status: true, defaultChannelId: true } });
    return row ? { ...row } : null;
  }

  async getWorkspaces(workspaceIds: string[]): Promise<Map<string, WorkspaceInfo>> {
    if (workspaceIds.length === 0) return new Map();
    const rows = await prisma.workspace.findMany({ where: { id: { in: workspaceIds } }, select: { id: true, name: true, status: true, defaultChannelId: true } });
    return new Map(rows.map((r) => [r.id, { ...r }]));
  }

  async getUserNames(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  async listMemberIdsByRole(workspaceId: string, roles: Array<"OWNER" | "ADMIN">): Promise<string[]> {
    const rows = await prisma.workspaceMembership.findMany({ where: { workspaceId, status: "ACTIVE", role: { in: roles } }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }
}

/** Quyền qua `PermissionService` (KHÔNG tự đọc `WorkspaceMembership`/`ChannelGrant` rồi so sánh). */
export class PermissionIntegrationAccess implements IIntegrationAccess {
  async workspaceAccess(userId: string, workspaceId: string): Promise<WorkspaceAccess> {
    const access = await permissionService.resolve(asUser(userId), { type: "WORKSPACE", id: workspaceId });
    return { visible: access.visible, role: access.role };
  }

  canWriteTarget(userId: string, scopeType: IntegrationTargetScopeType, scopeId: string): Promise<boolean> {
    return permissionService.can(asUser(userId), scopeType === "CHANNEL" ? "channel.message.send" : "conversation.message.send", { type: scopeType, id: scopeId });
  }

  canReadTarget(userId: string, scopeType: IntegrationTargetScopeType, scopeId: string): Promise<boolean> {
    return permissionService.can(asUser(userId), scopeType === "CHANNEL" ? "channel.read" : "conversation.read", { type: scopeType, id: scopeId });
  }
}

/** `INTEGRATION_ERROR` qua `notify()` trong một transaction (idempotent theo `dedupeKey`). */
export class NotifyIntegrationNotifier implements IIntegrationNotifier {
  async integrationError(notice: IntegrationErrorNotice): Promise<void> {
    if (notice.recipientIds.length === 0) return;
    const key = `integration-error:${notice.subjectId}:${notice.reason}:${notice.at.getTime()}`;
    await withTransaction((tx) =>
      notify(tx, {
        type: INTEGRATION_ERROR_TYPE,
        scope: notice.workspaceId ? { type: "WORKSPACE", id: notice.workspaceId } : null,
        workspaceId: notice.workspaceId ?? undefined,
        source: { type: "Integration", id: key },
        refs: { integrationId: notice.subjectId, workspaceId: notice.workspaceId ?? undefined, provider: notice.provider, reason: notice.reason },
        recipients: notice.recipientIds.map((userId) => ({ userId })),
        dedupeKey: key,
      })
    );
  }
}

export class SocketIntegrationEmitter implements IIntegrationEmitter {
  integrationUpdated(userIds: string[], payload: IntegrationUpdatedPayload): void {
    emitToUsers(userIds, SocketEvent.INTEGRATION_UPDATED, payload);
  }
}

/** Ghi cờ nhà cung cấp qua `SystemConfigService` (kiểm schema, CAS `version`, xoá cache đa instance, audit `system-config.update`). */
export class SystemConfigProviderStore implements IProviderConfigStore {
  private readonly service = createSystemConfigService();

  async read(): Promise<{ stored: Record<string, unknown>; version: number }> {
    const dto = await this.service.getOne("integrations");
    return { stored: dto.stored, version: dto.version };
  }

  async write(value: Record<string, unknown>, expectedVersion: number, reason: string, actor: { id: string; role?: string }): Promise<void> {
    await this.service.update("integrations", { value, expectedVersion, reason }, actor);
  }
}
