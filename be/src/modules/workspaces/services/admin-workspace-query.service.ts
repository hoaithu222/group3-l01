import { NotFoundError } from "../../../core/exceptions";
import type { IWorkspaceRepository, WorkspaceStatDay } from "../repositories/workspace.repository.interface";
import type { AdminListWorkspacesParams, AdminWorkspaceRow } from "../entities/workspace.interface";
import { toAdminWorkspaceRow, toAdminWorkspaceRowOf } from "./workspace.presenter";

export interface AdminWorkspaceDetail {
  workspace: AdminWorkspaceRow;
  stats30d: { messages: number; activeMembers: number; files: number };
}

const RANGE_DAYS: Record<"7d" | "30d" | "90d", number> = { "7d": 7, "30d": 30, "90d": 90 };

/** Đọc phục vụ trang admin (be.md §4 `/admin/workspaces*`) — tách khỏi `WorkspaceService` (dùng bởi người dùng thường). */
export class AdminWorkspaceQueryService {
  constructor(private readonly repo: IWorkspaceRepository) {}

  async list(params: AdminListWorkspacesParams): Promise<{ data: AdminWorkspaceRow[]; total: number }> {
    const { data, total } = await this.repo.adminList(params);
    return { data: data.map(toAdminWorkspaceRow), total };
  }

  async getDetail(workspaceId: string): Promise<AdminWorkspaceDetail> {
    const found = await this.repo.adminGetDetail(workspaceId);
    if (!found) throw new NotFoundError();

    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 3600 * 1000);
    const days = await this.repo.getDailyStats(workspaceId, from, to);
    const stats30d = days.reduce(
      (acc, day) => ({
        messages: acc.messages + day.messages,
        activeMembers: day.activeMembers,
        files: acc.files + day.files,
      }),
      { messages: 0, activeMembers: found.workspace.memberCount, files: 0 }
    );

    return { workspace: toAdminWorkspaceRowOf(found.workspace, found.owner), stats30d };
  }

  async getStats(workspaceId: string, range: "7d" | "30d" | "90d"): Promise<WorkspaceStatDay[]> {
    const to = new Date();
    const from = new Date(to.getTime() - RANGE_DAYS[range] * 24 * 3600 * 1000);
    return this.repo.getDailyStats(workspaceId, from, to);
  }
}
