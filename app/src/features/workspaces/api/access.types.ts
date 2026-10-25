/**
 * Kiểu DTO quyền truy cập nhóm — khách, duyệt tham gia (be.md p3-04 §2–§4).
 * Viết tay (chưa có `gen:api-types`, p0-09).
 */

export type JoinPolicy = 'OPEN' | 'APPROVAL';

/** `Workspace.guestPolicy` (be.md §2): bật/tắt mời khách, trần số khách/ngày, cho MEMBER mời qua email. */
export interface GuestPolicy {
  enabled: boolean;
  maxGuests: number;
  maxDays: number;
  memberCanInvite: boolean;
}

/** `PATCH /workspaces/:id/settings` (OWNER) — `workspaceSettingsSchema`. 409 `RES_003` khi `expectedVersion` lệch. */
export interface UpdateWorkspaceSettingsPayload {
  joinPolicy?: JoinPolicy;
  guestPolicy?: GuestPolicy;
  expectedVersion: number;
}

/**
 * Trả về của `PATCH …/settings`. ⚠️ be.md chỉ ghi tên `WorkspaceSettingsDto`, không
 * khai trường — giả định `{ joinPolicy, guestPolicy, version }`; màn dùng
 * `WorkspaceDetail` (cache `workspaceKeys.detail`) làm nguồn đọc và chỉ vá lại các
 * trường này, nên trường nào vắng thì không ghi đè.
 */
export interface WorkspaceSettingsDto {
  joinPolicy?: JoinPolicy;
  guestPolicy?: GuestPolicy | null;
  version?: number;
}
