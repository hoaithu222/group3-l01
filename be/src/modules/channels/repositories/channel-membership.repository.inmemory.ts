import type { IChannelMembershipRepository } from "./channel-membership.repository.interface";
import type { ChannelMembership, ChannelMembershipWithUser, ListChannelMembersParams } from "../entities/channel.interface";

/** Repository in-memory — dùng cho unit test service (không đụng Mongo). */
export class InMemoryChannelMembershipRepository implements IChannelMembershipRepository {
  memberships = new Map<string, ChannelMembership>();

  private key(channelId: string, userId: string): string {
    return `${channelId}:${userId}`;
  }

  seed(membership: ChannelMembership): void {
    this.memberships.set(this.key(membership.channelId, membership.userId), membership);
  }

  async find(channelId: string, userId: string): Promise<ChannelMembership | null> {
    return this.memberships.get(this.key(channelId, userId)) ?? null;
  }

  async listByUser(workspaceId: string, userId: string): Promise<ChannelMembership[]> {
    return [...this.memberships.values()].filter((m) => m.workspaceId === workspaceId && m.userId === userId);
  }

  async listByChannel(
    channelId: string,
    params: ListChannelMembersParams
  ): Promise<{ data: ChannelMembershipWithUser[]; total: number }> {
    const rows = [...this.memberships.values()]
      .filter((m) => m.channelId === channelId)
      .map((membership) => ({ membership, user: { id: membership.userId, name: "?", normalizedName: "?", avatarAssetId: null } }));
    const start = (params.page - 1) * params.limit;
    return { data: rows.slice(start, start + params.limit), total: rows.length };
  }
}
