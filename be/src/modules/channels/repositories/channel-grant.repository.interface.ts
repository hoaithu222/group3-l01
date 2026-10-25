import type { ChannelGrant, ChannelGrantWithUser } from "../entities/channel.interface";

export interface IChannelGrantRepository {
  /**
   * Mọi grant HIỆU LỰC của 1 user trong 1 kênh — DIRECT của chính user ∪ ROLE có `roleRef ∈ coveringRoles`
   * (các `roleRef` phủ tới vai trò workspace của user, xem `rolesCovering`). Mặc định `[]` = chỉ DIRECT.
   * Dùng bởi resolver §5.5 (`ctx.grants`).
   */
  forUser(channelId: string, userId: string, coveringRoles?: readonly string[]): Promise<ChannelGrant[]>;
  findDirect(channelId: string, userId: string): Promise<ChannelGrant | null>;
  /** Mọi kênh PRIVATE mà user có grant trong workspace (DIRECT ∪ ROLE phủ tới) — dùng cho "joined" (be.md §5.2). */
  listChannelIdsForUser(workspaceId: string, userId: string, coveringRoles?: readonly string[]): Promise<string[]>;
  /** Chỉ đếm MANAGER — luôn là grant DIRECT (role grant chỉ cấp MEMBER). */
  countManagers(channelId: string): Promise<number>;
  /** Grant DIRECT kèm người được cấp (grant ROLE không có người — lấy bằng `listRoleGrants`). */
  listByChannel(channelId: string): Promise<ChannelGrantWithUser[]>;
  /** Grant theo vai trò của kênh (`source = ROLE`), tối đa 2 dòng (`ADMIN`, `MEMBER`). */
  listRoleGrants(channelId: string): Promise<ChannelGrant[]>;
}
