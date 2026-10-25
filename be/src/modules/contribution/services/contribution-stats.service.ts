import { NotFoundError } from "../../../core/exceptions";
import type { IContributionDirectory } from "../repositories/contribution-directory.repository.interface";
import type { IContributionExportRepository } from "../repositories/contribution-export.repository.interface";
import type { IContributionStateRepository } from "../repositories/contribution-state.repository.interface";

export interface ContributionStatsDto {
  /** Bảng có công thức do chủ nhóm tuỳ chỉnh (đã đổi ít nhất một lần). */
  boardsWithCustomWeights: number;
  exports: { ready: number; failed: number };
  lastComputedAt: string | null;
  /** Bảng có thay đổi CHƯA được tính lại quá 1 giờ — dấu hiệu job `contribution.recompute` kẹt. */
  staleBoards: number;
  /** Bảng đang chờ tính lại (gồm cả chờ debounce). */
  pendingBoards: number;
}

const HOUR_MS = 3_600_000;

export interface ContributionStatsDeps {
  directory: IContributionDirectory;
  states: IContributionStateRepository;
  exports: IContributionExportRepository;
  now?: () => Date;
}

/**
 * `GET /admin/workspaces/:id/contribution-stats?days=30` — CHỈ SỐ ĐẾM cho admin nền tảng (p4-06 admin.md): không điểm, %, heatmap hay danh sách thẻ của
 * thành viên (đó là dữ liệu học tập của nhóm, bảng đóng góp chỉ đọc với mọi vai trò).
 */
export class ContributionStatsService {
  private readonly now: () => Date;

  constructor(private readonly d: ContributionStatsDeps) {
    this.now = d.now ?? (() => new Date());
  }

  async get(workspaceId: string, days: number): Promise<ContributionStatsDto> {
    if (!(await this.d.directory.workspaceExists(workspaceId))) throw new NotFoundError("Không tìm thấy nhóm");
    const now = this.now();
    const [states, exportCounts] = await Promise.all([
      this.d.states.listByWorkspace(workspaceId),
      this.d.exports.countByWorkspace(workspaceId, new Date(now.getTime() - days * 24 * HOUR_MS)),
    ]);
    const pending = states.filter((s) => s.factsVersion > s.computedVersion);
    const computed = states.flatMap((s) => (s.computedAt ? [s.computedAt.getTime()] : []));
    return {
      boardsWithCustomWeights: states.filter((s) => s.configVersion > 0).length,
      exports: exportCounts,
      lastComputedAt: computed.length > 0 ? new Date(Math.max(...computed)).toISOString() : null,
      staleBoards: pending.filter((s) => now.getTime() - s.updatedAt.getTime() > HOUR_MS).length,
      pendingBoards: pending.length,
    };
  }
}
