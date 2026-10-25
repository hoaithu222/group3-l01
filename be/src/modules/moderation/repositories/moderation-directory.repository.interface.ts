/**
 * "Danh bạ" chỉ ĐỌC dữ liệu của module khác mà kiểm duyệt cần (tên hiển thị, loại kênh/hội thoại,
 * người xử lý theo phạm vi) — đọc thẳng Prisma là ngoại lệ đã xác nhận cho model dùng chung (giống
 * `channel-permission.resolver.ts` đọc `prisma.workspace`), NHƯNG gói riêng ở đây để service không
 * import Prisma và test dùng bản giả. KHÔNG dùng để quyết định QUYỀN — quyền luôn qua
 * `permissionService`/`MessageModerationPort` (`.claude/rules/reuse-first.md`); các hàm `list*Admin*`
 * chỉ tính DANH SÁCH NGƯỜI NHẬN thông báo và tập phạm vi của hàng đợi (dữ liệu tổng hợp, không kiểm quyền).
 */
export interface DirectoryUser {
  id: string;
  name: string;
}

export interface DirectoryWorkspace {
  id: string;
  name: string;
}

export interface DirectoryChannel {
  id: string;
  name: string;
  workspaceId: string;
  visibility: "PUBLIC" | "PRIVATE";
  status: string;
}

export interface DirectoryConversation {
  id: string;
  kind: "DIRECT" | "GROUP";
  title: string | null;
  workspaceId: string | null;
  status: string;
}

export interface IModerationDirectory {
  findUsers(ids: string[]): Promise<DirectoryUser[]>;
  findWorkspaces(ids: string[]): Promise<DirectoryWorkspace[]>;
  findChannels(ids: string[]): Promise<DirectoryChannel[]>;
  findConversations(ids: string[]): Promise<DirectoryConversation[]>;

  isActiveWorkspaceMember(workspaceId: string, userId: string): Promise<boolean>;

  /** OWNER + ADMIN ACTIVE của workspace — người nhận `moderation.request` cho kênh public/USER có ngữ cảnh. */
  listWorkspaceAdminIds(workspaceId: string): Promise<string[]>;
  /** OWNER workspace — người nhận `moderation.private-viewed` (kênh private/nhóm chat). */
  findWorkspaceOwnerId(workspaceId: string): Promise<string | null>;
  listChannelManagerIds(channelId: string): Promise<string[]>;
  listConversationAdminIds(conversationId: string): Promise<string[]>;
  listConversationMemberIds(conversationId: string): Promise<string[]>;

  /** Người vận hành nền tảng ACTIVE có quyền `moderation:view` (theo vai trò hệ thống) — người nhận nhắc báo cáo tồn đọng; tối đa `limit`. */
  listPlatformModeratorIds(limit: number): Promise<string[]>;

  /** Kênh PRIVATE trong workspace mà `userId` là MANAGER (grant). */
  listManagedPrivateChannelIds(userId: string, workspaceId: string): Promise<string[]>;
  /** Nhóm chat (GROUP) trong workspace mà `userId` là OWNER/ADMIN ACTIVE. */
  listAdministeredGroupIds(userId: string, workspaceId: string): Promise<string[]>;

  /** `Notification.dedupeKey` đã tồn tại chưa — consumer bỏ qua `notify()` lần 2 (notify() không idempotent với outbox `deliver`). */
  notificationExists(dedupeKey: string): Promise<boolean>;
}
