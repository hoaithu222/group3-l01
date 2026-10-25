/**
 * Cổng mẫu workspace (p5-04) — `modules/workspaces` (tạo nhóm với `templateCode`) dùng mà KHÔNG import `modules/workspace-templates`.
 * `workspace-templates/index.ts` cài đặt và export factory `createWorkspaceTemplatePort()`; `workspaces.routes.ts` tự `new` khi wiring.
 *
 * Quy trình tạo nhóm từ mẫu: `plan()` TRƯỚC (kiểm mẫu còn bật + khoá kênh hợp lệ → `TPL_001`, chưa ghi gì) → tạo workspace →
 * `applyPlan()` SAU khi workspace đã commit (kênh tạo qua `ChannelCreationPort`, mỗi kênh một transaction riêng).
 */
export type TemplateChannelType = "TEXT" | "VOICE" | "POMODORO";

export interface TemplateChannelPlan {
  key: string;
  name: string;
  description: string;
  type: TemplateChannelType;
  visibility: "PUBLIC" | "PRIVATE";
  postingPolicy: "MEMBERS" | "ADMINS_ONLY";
}

export interface TemplatePlan {
  code: string;
  name: string;
  channels: TemplateChannelPlan[];
}

export type TemplateSkipReason = "NAME_EXISTS" | "TYPE_UNAVAILABLE";

export interface TemplateApplyResult {
  code: string;
  createdChannels: { key: string; id: string; name: string }[];
  skipped: { key: string; reason: TemplateSkipReason }[];
}

export interface WorkspaceTemplatePort {
  /** `channelKeys` vắng → các kênh `defaultSelected`; rỗng → không kênh nào. Mẫu không tồn tại/đã tắt hoặc khoá lạ → `TPL_001`. */
  plan(code: string, channelKeys: readonly string[] | undefined): Promise<TemplatePlan>;
  /** Tạo các kênh của `plan` trong workspace ACTIVE; kênh trùng tên (chuẩn hoá) hoặc loại chưa bật bị bỏ qua và báo lại. */
  applyPlan(input: { workspaceId: string; actorId: string; plan: TemplatePlan }): Promise<TemplateApplyResult>;
}
