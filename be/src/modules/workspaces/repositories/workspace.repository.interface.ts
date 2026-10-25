import type {
  Workspace,
  WorkspaceMembership,
  AdminListWorkspacesParams,
  AdminWorkspaceRecord,
  MembershipStatusValue,
  WorkspaceMeUpdateInput,
} from "../entities/workspace.interface";

export interface WorkspaceStatDay {
  /** "YYYY-MM-DD" theo `env.CRON_TZ` (cùng múi giờ với cron `workspace.stats-daily`). */
  date: string;
  messages: number;
  activeMembers: number;
  /** Tổng tệp đính kèm trong ngày (cộng dồn thành `stats30d.files` ở trang chi tiết admin). */
  files: number;
}

/**
 * Đọc + truy vấn đơn giản cho module `workspaces`. Ghi xuyên nhiều collection
 * (create/archive/restore/transfer) đi qua `withTransaction()` trực tiếp
 * trong service (giống `AssetLinkService`/`notify()`), KHÔNG qua đây — repo
 * này chỉ phục vụ đọc/liệt kê (be.md §1 nêu file này chủ yếu cho `list/get`).
 */
export interface IWorkspaceRepository {
  findById(id: string): Promise<Workspace | null>;
  findMembership(workspaceId: string, userId: string): Promise<WorkspaceMembership | null>;
  /** Kết hợp workspace + membership — dùng bởi resolver `WORKSPACE` (be.md §5.8). */
  findMembershipWithWorkspace(
    userId: string,
    workspaceId: string
  ): Promise<{ workspace: Workspace; membership: WorkspaceMembership } | null>;
  countActiveMembershipsForUser(userId: string): Promise<number>;
  countMembers(workspaceId: string, status?: MembershipStatusValue): Promise<number>;
  /** Thiết lập cá nhân (D-23) — ghi trực tiếp, không cần transaction/outbox (không có fan-out). */
  updateMembershipSettings(
    workspaceId: string,
    userId: string,
    input: WorkspaceMeUpdateInput
  ): Promise<WorkspaceMembership>;
  /** Danh sách workspace của 1 user (`GET /workspaces`) — kèm membership tương ứng. */
  listForUser(
    userId: string,
    status: "ACTIVE" | "ARCHIVED" | "ALL"
  ): Promise<Array<{ workspace: Workspace; membership: WorkspaceMembership }>>;
  /** p3-04 — nhóm mà user mới chỉ có YÊU CẦU chờ duyệt (membership PENDING); `GET /workspaces` trả kèm `status: "PENDING"`. */
  listPendingForUser(
    userId: string,
    status: "ACTIVE" | "ARCHIVED" | "ALL"
  ): Promise<Array<{ workspace: Workspace; membership: WorkspaceMembership }>>;
  adminList(params: AdminListWorkspacesParams): Promise<{ data: AdminWorkspaceRecord[]; total: number }>;
  adminGetDetail(id: string): Promise<{ workspace: Workspace; owner: { id: string; name: string } | null } | null>;
  getDailyStats(workspaceId: string, from: Date, to: Date): Promise<WorkspaceStatDay[]>;
}
