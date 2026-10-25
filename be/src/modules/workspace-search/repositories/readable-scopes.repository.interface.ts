import type { ReadableChannel, ReadableConversation } from "../entities/search.interface";

/**
 * Truy vấn ĐỌC thuần các collection của module khác (`Channel`, `ChannelGrant`, `ChannelMembership`, `Conversation`,
 * `ConversationMember`, `WorkspaceMembership`) để dựng tập scope người dùng đọc được — ngoại lệ có chủ đích của màn tìm
 * hợp nhất (be.md p5-04 §1). Không ghi, không import service của module khác.
 */
export interface IReadableScopesRepository {
  /** Mọi kênh của workspace (cả ARCHIVED); `ids` thu hẹp theo danh sách. */
  listChannels(workspaceId: string, ids?: readonly string[]): Promise<ReadableChannel[]>;
  /**
   * Id kênh người dùng có grant hiệu lực: DIRECT của chính họ ∪ ROLE phủ tới `coveringRoles` (khách: truyền rỗng ⇒ chỉ DIRECT).
   * Cùng ngữ nghĩa `effectiveFor` của `channels` (p3-04).
   */
  grantedChannelIds(workspaceId: string, userId: string, coveringRoles: readonly string[]): Promise<Set<string>>;
  /** Kênh người dùng đã tham gia (`ChannelMembership`). */
  joinedChannelIds(workspaceId: string, userId: string): Promise<Set<string>>;
  /** Nhóm chat (GROUP) của workspace mà người dùng là thành viên ACTIVE; nhóm đã giải tán bị loại. */
  listGroupConversations(workspaceId: string, userId: string, ids?: readonly string[]): Promise<ReadableConversation[]>;
  /** Hội thoại 1-1 (DIRECT) ACTIVE mà người dùng là thành viên ACTIVE; `peerUserId` = người còn lại. */
  listDirectConversations(userId: string, ids?: readonly string[]): Promise<ReadableConversation[]>;
  /** Trong `userIds`, ai còn là thành viên ACTIVE của workspace (khách hết hạn không tính). */
  activeMemberIds(workspaceId: string, userIds: readonly string[]): Promise<Set<string>>;
}
