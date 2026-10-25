import { normalizeSearch } from "../../../core/utils/normalize";
import { rankOf } from "../services/member-rank.policy";
import type {
  IMembershipRepository,
  MembershipWithUser,
  MemberUserSummary,
} from "./membership.repository.interface";
import type { WorkspaceMembership, ListMembersParams, AdminListMembersParams } from "../entities/member.interface";

export class InMemoryMembershipRepository implements IMembershipRepository {
  memberships = new Map<string, WorkspaceMembership>();
  users = new Map<string, MemberUserSummary>();

  private key(workspaceId: string, userId: string): string {
    return `${workspaceId}:${userId}`;
  }

  seedMembership(membership: WorkspaceMembership): void {
    this.memberships.set(this.key(membership.workspaceId, membership.userId), membership);
  }

  seedUser(user: MemberUserSummary): void {
    this.users.set(user.id, user);
  }

  async findByWorkspaceAndUser(workspaceId: string, userId: string): Promise<WorkspaceMembership | null> {
    return this.memberships.get(this.key(workspaceId, userId)) ?? null;
  }

  async findWithUser(workspaceId: string, userId: string): Promise<MembershipWithUser | null> {
    const membership = this.memberships.get(this.key(workspaceId, userId));
    if (!membership) return null;
    const user = this.users.get(userId);
    if (!user) return null;
    return { membership, user };
  }

  async countActiveByUser(userId: string): Promise<number> {
    return [...this.memberships.values()].filter((m) => m.userId === userId && m.status === "ACTIVE").length;
  }

  guestChannels = new Map<string, string[]>();

  async listPendingRequests(
    workspaceId: string,
    params: { cursor?: string; limit: number }
  ): Promise<{ data: MembershipWithUser[]; hasMore: boolean }> {
    const rows = this.join(
      [...this.memberships.values()]
        .filter((m) => m.workspaceId === workspaceId && m.status === "PENDING")
        .sort((a, b) => (b.requestedAt?.getTime() ?? 0) - (a.requestedAt?.getTime() ?? 0))
    );
    return { data: rows.slice(0, params.limit), hasMore: rows.length > params.limit };
  }

  async listExpiredGuests(now: Date, limit: number): Promise<WorkspaceMembership[]> {
    return [...this.memberships.values()]
      .filter((m) => m.role === "GUEST" && m.status === "ACTIVE" && m.expiresAt !== null && m.expiresAt <= now)
      .sort((a, b) => (a.expiresAt?.getTime() ?? 0) - (b.expiresAt?.getTime() ?? 0))
      .slice(0, limit);
  }

  async listGuestChannelIds(workspaceId: string, userId: string): Promise<string[]> {
    return this.guestChannels.get(this.key(workspaceId, userId)) ?? [];
  }

  private join(memberships: WorkspaceMembership[]): MembershipWithUser[] {
    const result: MembershipWithUser[] = [];
    for (const membership of memberships) {
      const user = this.users.get(membership.userId);
      if (!user) continue;
      result.push({ membership, user });
    }
    return result;
  }

  private sort(rows: MembershipWithUser[], sort: "role" | "name" | "joinedAt"): MembershipWithUser[] {
    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (sort === "role") {
        const diff = rankOf(b.membership.role) - rankOf(a.membership.role);
        if (diff !== 0) return diff;
        return a.user.normalizedName.localeCompare(b.user.normalizedName);
      }
      if (sort === "name") return a.user.normalizedName.localeCompare(b.user.normalizedName);
      return a.membership.joinedAt.getTime() - b.membership.joinedAt.getTime();
    });
    return sorted;
  }

  async listMembers(
    workspaceId: string,
    params: ListMembersParams
  ): Promise<{ data: MembershipWithUser[]; total: number }> {
    let rows = this.join(
      [...this.memberships.values()].filter(
        (m) => m.workspaceId === workspaceId && m.status === params.status && (!params.role || m.role === params.role)
      )
    );
    if (params.q) {
      const needle = normalizeSearch(params.q);
      rows = rows.filter((r) => r.user.normalizedName.includes(needle));
    }
    rows = this.sort(rows, params.sort);
    const start = (params.page - 1) * params.limit;
    return { data: rows.slice(start, start + params.limit), total: rows.length };
  }

  async adminListMembers(
    workspaceId: string,
    params: AdminListMembersParams
  ): Promise<{ data: MembershipWithUser[]; total: number }> {
    let rows = this.join(
      [...this.memberships.values()].filter(
        (m) =>
          m.workspaceId === workspaceId &&
          (!params.status || m.status === params.status) &&
          (!params.role || m.role === params.role)
      )
    );
    if (params.q) {
      const needle = normalizeSearch(params.q);
      rows = rows.filter((r) => r.user.normalizedName.includes(needle));
    }
    rows = this.sort(rows, params.sort);
    const start = (params.page - 1) * params.limit;
    return { data: rows.slice(start, start + params.limit), total: rows.length };
  }
}
