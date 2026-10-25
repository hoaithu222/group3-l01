import type { ChannelMembership, ChannelMembershipWithUser, ListChannelMembersParams } from "../entities/channel.interface";

export interface IChannelMembershipRepository {
  find(channelId: string, userId: string): Promise<ChannelMembership | null>;
  /** `ChannelMembership` của 1 user trong workspace — nguồn "đã tham gia" cho `list()` (be.md §5.2). */
  listByUser(workspaceId: string, userId: string): Promise<ChannelMembership[]>;
  /** Danh sách thành viên kênh PUBLIC (`GET /channels/:id/members`) — join `User`, lọc/paginate ở tầng ứng dụng (quy mô nhỏ, giống `membership.repository.prisma.ts`). */
  listByChannel(channelId: string, params: ListChannelMembersParams): Promise<{ data: ChannelMembershipWithUser[]; total: number }>;
}
