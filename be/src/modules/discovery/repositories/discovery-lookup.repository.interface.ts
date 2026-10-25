import type { ChannelInfo, ConversationInfo, DiscoveryUserBrief } from "../entities/discovery.interface";

/**
 * Tra cứu thông tin hiển thị (tên kênh/hội thoại/người dùng) để dựng `SavedItem`/
 * `SearchHit`. CHỈ gọi cho phạm vi/tin mà người xem đã qua kiểm quyền — repo này
 * không tự kiểm quyền.
 */
export interface IDiscoveryLookupRepository {
  describeChannels(channelIds: string[]): Promise<Map<string, ChannelInfo>>;
  /** DIRECT: `peerName` = tên người còn lại theo `viewerId` (qua `ConversationMember.peerUserId`). */
  describeConversations(viewerId: string, conversationIds: string[]): Promise<Map<string, ConversationInfo>>;
  /** Tên + `avatarAssetId` theo lô (MỘT truy vấn user); id không tồn tại không có mặt trong Map. */
  userBriefs(userIds: string[]): Promise<Map<string, DiscoveryUserBrief>>;
}
