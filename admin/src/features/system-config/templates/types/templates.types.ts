/**
 * Kiểu dữ liệu `/admin/workspace-templates` — khớp `AdminTemplateDto` phía BE
 * (`be/src/modules/workspace-templates/workspace-templates.service.ts`).
 *
 * Viết tay vì `openapi.json` chưa được sinh (p0-09); thay bằng kiểu sinh khi p0-09 xong.
 */

export type TemplateChannelType = 'TEXT' | 'VOICE' | 'POMODORO';
export type TemplateChannelVisibility = 'PUBLIC' | 'PRIVATE';
export type TemplatePostingPolicy = 'MEMBERS' | 'ADMINS_ONLY';

/** Một kênh trong mẫu — kênh mặc định "Chung" KHÔNG khai ở đây (BE tự tạo cùng nhóm). */
export interface TemplateChannel {
  /** Khoá ổn định (`a-z0-9-`, ≤ 40) — client tạo nhóm gửi danh sách khoá đã chọn. */
  key: string;
  name: string;
  description: string;
  type: TemplateChannelType;
  visibility: TemplateChannelVisibility;
  postingPolicy: TemplatePostingPolicy;
  /** Tích sẵn ở bước chọn kênh khi tạo nhóm từ mẫu. */
  defaultSelected: boolean;
}

export interface WorkspaceTemplate {
  /** `course` · `capstone` · `self-study` — seed bằng script, KHÔNG tạo/xoá từ UI. */
  code: string;
  name: string;
  description: string;
  channels: TemplateChannel[];
  isActive: boolean;
  order: number;
  /** Phiên bản để khoá lạc quan — gửi lại làm `expectedVersion`. */
  version: number;
  /** Id người sửa gần nhất; `null` = chưa ai sửa (bản seed). */
  updatedBy: string | null;
  updatedAt: string;
}

/** Các trường sửa được (BE nhận sửa một phần, cần ≥ 1 trường). */
export interface TemplateUpdateFields {
  name?: string;
  description?: string;
  isActive?: boolean;
  order?: number;
  channels?: TemplateChannel[];
}

export interface UpdateTemplatePayload extends TemplateUpdateFields {
  expectedVersion: number;
  /** 10–500 ký tự — ghi vào nhật ký quản trị. */
  reason: string;
}

/** Một bước đổi thứ tự: chỉ mẫu có `order` thay đổi mới được gửi. */
export interface TemplateOrderChange {
  code: string;
  order: number;
  expectedVersion: number;
}
