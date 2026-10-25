/**
 * Đọc thông tin hiển thị/nhận thông báo từ collection của module khác (workspace, người dùng, kênh) — CHỈ ĐỌC, không dùng để
 * quyết định quyền (quyền luôn qua `permissionService`, xem `services/mentor-access.ts`).
 */
export interface WorkspaceBrief {
  id: string;
  name: string;
  status: string;
  defaultChannelId: string | null;
  /** Ảnh đại diện nhóm (asset id thô — presenter đổi thành URL ký sẵn); `null` = chưa đặt. */
  avatarAssetId: string | null;
}

export interface UserBrief {
  id: string;
  name: string;
  /** Asset id thô; `null` = chưa đặt ảnh/tài khoản đã ẩn danh hoá. */
  avatarAssetId: string | null;
}

export interface ChannelBrief {
  id: string;
  workspaceId: string;
  name: string;
  status: string;
  visibility: "PUBLIC" | "PRIVATE";
}

export interface IMentorDirectory {
  workspaces(ids: string[]): Promise<Map<string, WorkspaceBrief>>;
  users(ids: string[]): Promise<Map<string, UserBrief>>;
  channels(workspaceId: string, ids: string[]): Promise<ChannelBrief[]>;
  /** OWNER/ADMIN ACTIVE của nhóm (người nhận thông báo đơn mới). */
  adminIds(workspaceId: string): Promise<string[]>;
}
