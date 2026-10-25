import type { IWorkspaceRepository, WorkspaceStatDay } from "./workspace.repository.interface";
import type {
  Workspace,
  WorkspaceMembership,
  AdminListWorkspacesParams,
  AdminWorkspaceRecord,
  MembershipStatusValue,
  WorkspaceMeUpdateInput,
} from "../entities/workspace.interface";

/** Repository in-memory — dùng cho unit test service (không đụng Mongo). */
export class InMemoryWorkspaceRepository implements IWorkspaceRepository {
  workspaces = new Map<string, Workspace>();
  memberships = new Map<string, WorkspaceMembership>();
  private dailyStats: WorkspaceStatDay[] = [];

  private membershipKey(workspaceId: string, userId: string): string {
    return `${workspaceId}:${userId}`;
  }

  seedWorkspace(workspace: Workspace): void {
    this.workspaces.set(workspace.id, workspace);
  }

  seedMembership(membership: WorkspaceMembership): void {
    this.memberships.set(this.membershipKey(membership.workspaceId, membership.userId), membership);
  }

  async findById(id: string): Promise<Workspace | null> {
    return this.workspaces.get(id) ?? null;
  }

  async findMembership(workspaceId: string, userId: string): Promise<WorkspaceMembership | null> {
    return this.memberships.get(this.membershipKey(workspaceId, userId)) ?? null;
  }

  async findMembershipWithWorkspace(
    userId: string,
    workspaceId: string
  ): Promise<{ workspace: Workspace; membership: WorkspaceMembership } | null> {
    const workspace = this.workspaces.get(workspaceId);
    const membership = this.memberships.get(this.membershipKey(workspaceId, userId));
    if (!workspace || !membership) return null;
    return { workspace, membership };
  }

  async countActiveMembershipsForUser(userId: string): Promise<number> {
    return [...this.memberships.values()].filter((m) => m.userId === userId && m.status === "ACTIVE").length;
  }

  async countMembers(workspaceId: string, status: MembershipStatusValue = "ACTIVE"): Promise<number> {
    return [...this.memberships.values()].filter((m) => m.workspaceId === workspaceId && m.status === status)
      .length;
  }

  async updateMembershipSettings(
    workspaceId: string,
    userId: string,
    input: WorkspaceMeUpdateInput
  ): Promise<WorkspaceMembership> {
    const key = this.membershipKey(workspaceId, userId);
    const existing = this.memberships.get(key);
    if (!existing) throw new Error("[InMemoryWorkspaceRepository] membership không tồn tại");
    const updated: WorkspaceMembership = {
      ...existing,
      ...(input.isFavorite !== undefined && { isFavorite: input.isFavorite }),
      ...(input.position !== undefined && { position: input.position }),
      ...(input.notifyMode !== undefined && { notifyMode: input.notifyMode }),
    };
    this.memberships.set(key, updated);
    return updated;
  }

  async listForUser(
    userId: string,
    status: "ACTIVE" | "ARCHIVED" | "ALL"
  ): Promise<Array<{ workspace: Workspace; membership: WorkspaceMembership }>> {
    const result: Array<{ workspace: Workspace; membership: WorkspaceMembership }> = [];
    for (const membership of this.memberships.values()) {
      if (membership.userId !== userId || membership.status !== "ACTIVE") continue;
      const workspace = this.workspaces.get(membership.workspaceId);
      if (!workspace) continue;
      if (status !== "ALL" && workspace.status !== status) continue;
      result.push({ workspace, membership });
    }
    // Khớp `orderBy` của bản Prisma: yêu thích trước, rồi `position`, rồi mới nhất trước.
    result.sort((a, b) => {
      if (a.membership.isFavorite !== b.membership.isFavorite) return a.membership.isFavorite ? -1 : 1;
      const posA = a.membership.position ?? Number.POSITIVE_INFINITY;
      const posB = b.membership.position ?? Number.POSITIVE_INFINITY;
      if (posA !== posB) return posA - posB;
      return b.membership.joinedAt.getTime() - a.membership.joinedAt.getTime();
    });
    return result;
  }

  async listPendingForUser(
    userId: string,
    status: "ACTIVE" | "ARCHIVED" | "ALL"
  ): Promise<Array<{ workspace: Workspace; membership: WorkspaceMembership }>> {
    const result: Array<{ workspace: Workspace; membership: WorkspaceMembership }> = [];
    for (const membership of this.memberships.values()) {
      if (membership.userId !== userId || membership.status !== "PENDING") continue;
      const workspace = this.workspaces.get(membership.workspaceId);
      if (!workspace) continue;
      if (status !== "ALL" && workspace.status !== status) continue;
      result.push({ workspace, membership });
    }
    return result;
  }

  async adminList(params: AdminListWorkspacesParams): Promise<{ data: AdminWorkspaceRecord[]; total: number }> {
    let all = [...this.workspaces.values()];
    if (params.status) all = all.filter((w) => w.status === params.status);
    if (params.ownerId) all = all.filter((w) => w.ownerId === params.ownerId);
    if (params.q) all = all.filter((w) => w.normalizedName.includes(params.q!.toLowerCase()));
    const total = all.length;
    const start = (params.page - 1) * params.limit;
    const data: AdminWorkspaceRecord[] = all.slice(start, start + params.limit).map((w) => ({
      id: w.id,
      name: w.name,
      avatarAssetId: w.avatarAssetId,
      coverAssetId: w.coverAssetId ?? null,
      coverPreset: w.coverPreset ?? null,
      owner: null,
      memberCount: w.memberCount,
      status: w.status,
      createdAt: w.createdAt,
      lastActivityAt: w.lastActivityAt,
    }));
    return { data, total };
  }

  async adminGetDetail(
    id: string
  ): Promise<{ workspace: Workspace; owner: { id: string; name: string } | null } | null> {
    const workspace = this.workspaces.get(id);
    if (!workspace) return null;
    return { workspace, owner: null };
  }

  seedDailyStat(stat: WorkspaceStatDay): void {
    this.dailyStats.push(stat);
  }

  async getDailyStats(_workspaceId: string, _from: Date, _to: Date): Promise<WorkspaceStatDay[]> {
    return this.dailyStats;
  }
}
