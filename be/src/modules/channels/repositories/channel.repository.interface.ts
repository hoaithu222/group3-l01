import type { Channel, ChannelStatusValue, ChannelTypeValue, AdminListChannelsParams, AdminChannelRow } from "../entities/channel.interface";

/**
 * Đọc/liệt kê cho module `channels` — ghi xuyên nhiều collection (create/
 * archive/restore/grant) đi qua `withTransaction()` trực tiếp trong service
 * (giống `workspace.repository.interface.ts`), KHÔNG qua đây.
 */
export interface IChannelRepository {
  findById(id: string): Promise<Channel | null>;
  findByWorkspaceAndNormalizedName(workspaceId: string, normalizedName: string, status?: ChannelStatusValue): Promise<Channel | null>;
  countActive(workspaceId: string): Promise<number>;
  listByIds(ids: string[]): Promise<Channel[]>;
  /** Mọi kênh (public + private) trong workspace theo trạng thái — dùng cho "joined"/lookup, lọc hiển thị ở service (quy mô ≤ `perWorkspaceMax`, giống `membership.repository.prisma.ts`). */
  listByWorkspace(workspaceId: string, status: ChannelStatusValue, type?: ChannelTypeValue): Promise<Channel[]>;
  adminListPublic(workspaceId: string, params: AdminListChannelsParams): Promise<{ data: AdminChannelRow[]; total: number }>;
  adminCountPrivate(workspaceId: string): Promise<{ total: number; archived: number }>;
}
