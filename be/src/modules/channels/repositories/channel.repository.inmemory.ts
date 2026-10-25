import type { IChannelRepository } from "./channel.repository.interface";
import type {
  Channel,
  ChannelStatusValue,
  ChannelTypeValue,
  AdminListChannelsParams,
  AdminChannelRow,
} from "../entities/channel.interface";

/** Repository in-memory — dùng cho unit test service (không đụng Mongo). */
export class InMemoryChannelRepository implements IChannelRepository {
  channels = new Map<string, Channel>();

  seed(channel: Channel): void {
    this.channels.set(channel.id, channel);
  }

  async findById(id: string): Promise<Channel | null> {
    return this.channels.get(id) ?? null;
  }

  async findByWorkspaceAndNormalizedName(
    workspaceId: string,
    normalizedName: string,
    status?: ChannelStatusValue
  ): Promise<Channel | null> {
    for (const c of this.channels.values()) {
      if (c.workspaceId === workspaceId && c.normalizedName === normalizedName && (!status || c.status === status)) {
        return c;
      }
    }
    return null;
  }

  async countActive(workspaceId: string): Promise<number> {
    return [...this.channels.values()].filter((c) => c.workspaceId === workspaceId && c.status === "ACTIVE").length;
  }

  async listByIds(ids: string[]): Promise<Channel[]> {
    return ids.map((id) => this.channels.get(id)).filter((c): c is Channel => !!c);
  }

  async listByWorkspace(workspaceId: string, status: ChannelStatusValue, type?: ChannelTypeValue): Promise<Channel[]> {
    return [...this.channels.values()].filter(
      (c) => c.workspaceId === workspaceId && c.status === status && (!type || c.type === type)
    );
  }

  async adminListPublic(
    workspaceId: string,
    params: AdminListChannelsParams
  ): Promise<{ data: AdminChannelRow[]; total: number }> {
    const all = [...this.channels.values()].filter(
      (c) =>
        c.workspaceId === workspaceId &&
        c.visibility === "PUBLIC" &&
        (!params.status || c.status === params.status) &&
        (!params.type || c.type === params.type)
    );
    const start = (params.page - 1) * params.limit;
    const data: AdminChannelRow[] = all.slice(start, start + params.limit).map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      postingPolicy: c.postingPolicy,
      status: c.status,
      isDefault: c.isDefault,
      archiveReason: c.archiveReason,
      memberCount: c.memberCount,
      messages7d: 0,
      createdAt: c.createdAt,
    }));
    return { data, total: all.length };
  }

  async adminCountPrivate(workspaceId: string): Promise<{ total: number; archived: number }> {
    const priv = [...this.channels.values()].filter((c) => c.workspaceId === workspaceId && c.visibility === "PRIVATE");
    return { total: priv.length, archived: priv.filter((c) => c.status === "ARCHIVED").length };
  }
}
