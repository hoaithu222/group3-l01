/**
 * Kiểu dữ liệu phân hệ Workspace — khớp `AdminWorkspaceRow`/`WorkspaceDetail`
 * phía BE (`be/src/modules/workspaces`, p1-01 be.md §4).
 */

export type WorkspaceStatus = 'ACTIVE' | 'ARCHIVED';
export type WorkspaceArchiveReason = 'MANUAL' | 'PLATFORM';

/**
 * Mẫu nền bìa khi nhóm CHƯA có ảnh bìa — khoá `WORKSPACE_COVER_PRESETS` phía BE
 * (`be/src/modules/workspaces/entities/workspace.interface.ts`); khoá lạ/đã bỏ BE trả `null`.
 */
export type WorkspaceCoverPreset = 'violet' | 'amber' | 'ocean' | 'forest' | 'sunset' | 'rose' | 'slate';

/** Loại ảnh gỡ được bằng `POST /admin/workspaces/:id/remove-image`. */
export type WorkspaceImageKind = 'AVATAR' | 'COVER';

/**
 * Ba trường `*Url` là URL TUYỆT ĐỐI ký sẵn (`…/api/v1/assets/<id>/image?v=…&e=…&s=…`): dùng thẳng làm `src`, KHÔNG gửi
 * Bearer. URL hết hạn sau 1–2 ngày — response mới luôn kèm URL mới, đừng lưu lâu.
 */
export interface AdminWorkspaceRow {
  id: string;
  name: string;
  /** Ảnh đại diện (bản THUMB). `null` = chưa đặt ⇒ chữ cái đầu tên. */
  avatarUrl: string | null;
  /** Ảnh bìa bản gốc (khổ lớn — đầu khối "Thông tin nhóm"). `null` = chưa đặt ⇒ nền theo `coverPreset`. */
  coverUrl: string | null;
  /** Ảnh bìa bản THUMB (≤ 320 px) — cho ô nhỏ. */
  coverThumbUrl: string | null;
  /** `null` ⇒ client tự chọn ổn định theo id nhóm (`coverPresetFor`, cùng hàm với app). */
  coverPreset: WorkspaceCoverPreset | null;
  owner: { id: string; name: string } | null;
  memberCount: number;
  status: WorkspaceStatus;
  createdAt: string;
  lastActivityAt: string;
}

export interface AdminWorkspaceDetail {
  workspace: AdminWorkspaceRow;
  stats30d: { messages: number; activeMembers: number; files: number };
}

export interface WorkspaceStatDay {
  date: string;
  messages: number;
  activeMembers: number;
  /** Tệp đính kèm trong ngày (BE `WorkspaceStatDay.files`; `stats30d.files` là tổng). UI chưa dựng cột này. */
  files?: number;
}

export type WorkspaceStatsRange = '7d' | '30d' | '90d';

export interface WorkspaceListParams {
  q?: string;
  status?: WorkspaceStatus;
  ownerId?: string;
  createdFrom?: string;
  createdTo?: string;
  sort?: 'lastActivityAt' | 'createdAt' | 'memberCount' | 'name';
  page: number;
  limit: number;
}

export interface ReasonPayload {
  reason: string;
}

/** Body của `POST /admin/workspaces/:id/remove-image` (BE `adminRemoveImageSchema`: lý do 10–500 ký tự). */
export interface RemoveWorkspaceImagePayload extends ReasonPayload {
  kind: WorkspaceImageKind;
}

/** `data` của `POST /admin/workspaces/:id/remove-image`. `removed: false` = nhóm không có ảnh loại đó (BE không ghi gì). */
export interface RemoveWorkspaceImageResult {
  workspace: AdminWorkspaceRow;
  removed: boolean;
}

/** Gợi ý cho ô chọn workspace (`GET /admin/workspaces`, rút gọn còn `id` + `name`). */
export type WorkspaceOption = Pick<AdminWorkspaceRow, 'id' | 'name'>;

/**
 * Gợi ý cho ô lọc CHỦ SỞ HỮU của danh bạ workspace (`GET /users`, rút gọn còn `id` + `name` + `email` — email để
 * phân biệt hai người trùng tên). Hợp đồng của phân hệ `user`: `be/src/modules/users/dtos/list-users.dto.ts`.
 */
export interface OwnerOption {
  id: string;
  name: string;
  email: string;
}

/** Một trang gợi ý chủ sở hữu (tìm phía server, tải thêm theo trang). */
export interface OwnerOptionsPage {
  items: OwnerOption[];
  page: number;
  hasNext: boolean;
}

/** Một trang gợi ý workspace (tìm phía server, tải thêm theo trang). */
export interface WorkspaceOptionsPage {
  items: WorkspaceOption[];
  page: number;
  hasNext: boolean;
}
