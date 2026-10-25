import type { IChannelGrantRepository } from "./channel-grant.repository.interface";
import type { ChannelGrant, ChannelGrantWithUser } from "../entities/channel.interface";

/** Grant thiếu `subjectKey` khi seed (test Phase 1) → suy ra: `role:<roleRef>` (ROLE) hoặc `userId` (DIRECT). */
type SeedGrant = Omit<ChannelGrant, "subjectKey"> & { subjectKey?: string };

/** Repository in-memory — dùng cho unit test service (không đụng Mongo). */
export class InMemoryChannelGrantRepository implements IChannelGrantRepository {
  grants = new Map<string, ChannelGrant>();

  private key(channelId: string, subjectKey: string, source: string): string {
    return `${channelId}:${subjectKey}:${source}`;
  }

  seed(grant: SeedGrant): void {
    const subjectKey = grant.subjectKey ?? (grant.source === "ROLE" ? `role:${grant.roleRef ?? ""}` : (grant.userId ?? ""));
    const full: ChannelGrant = { ...grant, subjectKey };
    this.grants.set(this.key(full.channelId, full.subjectKey, full.source), full);
  }

  async forUser(channelId: string, userId: string, coveringRoles: readonly string[] = []): Promise<ChannelGrant[]> {
    return [...this.grants.values()].filter(
      (g) =>
        g.channelId === channelId &&
        ((g.source === "DIRECT" && g.userId === userId) ||
          (g.source === "ROLE" && g.roleRef !== null && coveringRoles.includes(g.roleRef)))
    );
  }

  async findDirect(channelId: string, userId: string): Promise<ChannelGrant | null> {
    return this.grants.get(this.key(channelId, userId, "DIRECT")) ?? null;
  }

  async listChannelIdsForUser(workspaceId: string, userId: string, coveringRoles: readonly string[] = []): Promise<string[]> {
    return Array.from(
      new Set(
        [...this.grants.values()]
          .filter(
            (g) =>
              g.workspaceId === workspaceId &&
              ((g.source === "DIRECT" && g.userId === userId) ||
                (g.source === "ROLE" && g.roleRef !== null && coveringRoles.includes(g.roleRef)))
          )
          .map((g) => g.channelId)
      )
    );
  }

  async countManagers(channelId: string): Promise<number> {
    return [...this.grants.values()].filter((g) => g.channelId === channelId && g.level === "MANAGER").length;
  }

  async listByChannel(channelId: string): Promise<ChannelGrantWithUser[]> {
    return [...this.grants.values()]
      .filter((g) => g.channelId === channelId && g.source === "DIRECT" && g.userId !== null)
      .map((grant) => ({ grant, user: { id: grant.userId as string, name: "?", normalizedName: "?", avatarAssetId: null } }));
  }

  async listRoleGrants(channelId: string): Promise<ChannelGrant[]> {
    return [...this.grants.values()].filter((g) => g.channelId === channelId && g.source === "ROLE");
  }
}
