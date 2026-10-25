import type { IntegrationTargetScopeType } from "../../../core/constants/integration";
import type { IntegrationEntity } from "../entities/integration.interface";
import { intErrors } from "../integrations.errors";
import type { IIntegrationAccess, IIntegrationDirectory } from "./integration.ports";
import type { TargetView } from "./integration.presenter";

export type PostableCheck = { ok: true } | { ok: false; reason: "TARGET_FORBIDDEN" | "TARGET_ARCHIVED" };

interface TargetFacts {
  exists: boolean;
  sameWorkspace: boolean;
  active: boolean;
  /** Loại đích nhận được tin hệ thống (kênh TEXT / nhóm chat GROUP). */
  postable: boolean;
  name: string | null;
  isPrivate: boolean;
}

/**
 * Kiểm ĐÍCH nhận tin của kết nối (INT-06, README §2): kênh/nhóm chat phải thuộc đúng workspace, còn hoạt động, đăng tin được, và NGƯỜI CẤU HÌNH phải còn
 * quyền GHI vào đó (kênh riêng tư cần grant `write`) — nếu không kết nối sẽ thành cửa sau vào kênh riêng tư. Kiểm ở lúc cấu hình (`assertWritable`, `INT_005`)
 * VÀ lúc đăng tin (`checkPostable`, worker) — quyền có thể bị thu hồi giữa hai thời điểm.
 */
export class IntegrationTargetService {
  constructor(
    private readonly dir: IIntegrationDirectory,
    private readonly access: IIntegrationAccess
  ) {}

  private async facts(workspaceId: string, scopeType: IntegrationTargetScopeType, scopeId: string): Promise<TargetFacts> {
    if (scopeType === "CHANNEL") {
      const c = await this.dir.getChannel(scopeId);
      if (!c) return { exists: false, sameWorkspace: false, active: false, postable: false, name: null, isPrivate: false };
      return { exists: true, sameWorkspace: c.workspaceId === workspaceId, active: c.status === "ACTIVE", postable: c.type === "TEXT", name: c.name, isPrivate: c.visibility === "PRIVATE" };
    }
    const g = await this.dir.getConversation(scopeId);
    if (!g) return { exists: false, sameWorkspace: false, active: false, postable: false, name: null, isPrivate: false };
    return { exists: true, sameWorkspace: g.workspaceId === workspaceId, active: g.status === "ACTIVE", postable: g.kind === "GROUP", name: g.title, isPrivate: true };
  }

  /** Cấu hình đích: ném `INT_005` (403) khi không hợp lệ hoặc `userId` không có quyền ghi. Không phân biệt "không tồn tại" và "không được phép". */
  async assertWritable(userId: string, workspaceId: string, scopeType: IntegrationTargetScopeType, scopeId: string): Promise<void> {
    const f = await this.facts(workspaceId, scopeType, scopeId);
    if (!f.exists || !f.sameWorkspace || !f.active || !f.postable) throw intErrors.targetForbidden({ reason: "TARGET_INVALID" });
    if (!(await this.access.canWriteTarget(userId, scopeType, scopeId))) throw intErrors.targetForbidden({ reason: "TARGET_FORBIDDEN" });
  }

  /** Kênh mặc định của workspace làm đích khi vừa kết nối (README §5 callback). `null` nếu workspace không có kênh mặc định. */
  async defaultTarget(workspaceId: string): Promise<{ scopeType: "CHANNEL"; scopeId: string } | null> {
    const ws = await this.dir.getWorkspace(workspaceId);
    return ws?.defaultChannelId ? { scopeType: "CHANNEL", scopeId: ws.defaultChannelId } : null;
  }

  /** Lúc đăng tin (worker): đích còn hợp lệ không, và người cấu hình còn quyền ghi không. Không ném. */
  async checkPostable(integration: IntegrationEntity): Promise<PostableCheck> {
    const f = await this.facts(integration.workspaceId, integration.targetScopeType, integration.targetScopeId);
    if (!f.exists || !f.sameWorkspace || !f.active || !f.postable) return { ok: false, reason: "TARGET_ARCHIVED" };
    const canWrite = await this.access.canWriteTarget(integration.createdBy, integration.targetScopeType, integration.targetScopeId);
    return canWrite ? { ok: true } : { ok: false, reason: "TARGET_FORBIDDEN" };
  }

  /** Mô tả đích cho người xem: tên chỉ hiện khi người xem đọc được đích (kênh riêng tư → `name = null`). */
  async describe(viewerId: string, workspaceId: string, scopeType: IntegrationTargetScopeType, scopeId: string): Promise<TargetView> {
    const f = await this.facts(workspaceId, scopeType, scopeId);
    const visible = f.exists && f.sameWorkspace && (!f.isPrivate || (await this.access.canReadTarget(viewerId, scopeType, scopeId)));
    return { scopeType, scopeId, name: visible ? f.name : null, private: f.isPrivate };
  }
}
