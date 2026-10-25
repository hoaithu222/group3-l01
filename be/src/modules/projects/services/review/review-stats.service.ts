import { NotFoundError } from "../../../../core/exceptions";
import type { IBoardRepository } from "../../repositories/board.repository.interface";
import type { IProjectDirectory } from "../../repositories/project-directory.interface";
import type { IReviewStatsRepository } from "../../repositories/task-review.repository.interface";
import { parseBoardReview } from "./review-config.schema";

const HOUR_MS = 3_600_000;
/** Chờ quá ngần này giờ thì tính là "quá hạn" (khớp mốc nhắc thứ hai). */
const OVERDUE_HOURS = 72;
/** Trần số lượt nộp đọc để tính trung vị (nhóm học tập nhỏ; lớn hơn thì lấy các lượt nộp gần nhất). */
const SAMPLE_MAX = 5000;

export interface ReviewStatsDto {
  openRounds: number;
  pendingReviews: number;
  overdue72h: number;
  medianHoursToSubmit: number | null;
  /** Tổng số lượt mở trong khoảng — mẫu số của "tỉ lệ tự duyệt" (admin hiện `Callout` khi > 30 %). */
  roundsInPeriod: number;
  autoApprovedRounds: number;
  waivedRounds: number;
  byBoard: { boardId: string; boardName: string; enabled: boolean; openRounds: number }[];
}

/** Trung vị (giờ, 1 chữ số thập phân) của khoảng giao → nộp; `null` khi chưa có lượt nộp nào. */
export function medianHours(rows: readonly { assignedAt: Date; submittedAt: Date }[]): number | null {
  if (rows.length === 0) return null;
  const hours = rows.map((r) => Math.max(0, (r.submittedAt.getTime() - r.assignedAt.getTime()) / HOUR_MS)).sort((a, b) => a - b);
  const mid = Math.floor(hours.length / 2);
  const median = hours.length % 2 === 1 ? hours[mid] : (hours[mid - 1] + hours[mid]) / 2;
  return Math.round(median * 10) / 10;
}

/**
 * `GET /admin/workspaces/:id/review-stats?days=30` (p4-05 admin.md §2.2). CHỈ SỐ ĐẾM + tên bảng (metadata tổ chức): KHÔNG tên người chấm, điểm, nhận xét,
 * tiêu đề thẻ — đó là dữ liệu học tập của nhóm.
 */
export class ReviewStatsService {
  constructor(
    private readonly stats: IReviewStatsRepository,
    private readonly boards: IBoardRepository,
    private readonly directory: IProjectDirectory
  ) {}

  async get(workspaceId: string, days: number, now: Date = new Date()): Promise<ReviewStatsDto> {
    if (!(await this.directory.workspaceNames([workspaceId])).has(workspaceId)) throw new NotFoundError("Không tìm thấy nhóm");
    const since = new Date(now.getTime() - days * 24 * HOUR_MS);
    const [raw, boards] = await Promise.all([
      this.stats.forWorkspace(workspaceId, since, new Date(now.getTime() - OVERDUE_HOURS * HOUR_MS), SAMPLE_MAX),
      this.boards.listByWorkspace(workspaceId, false),
    ]);
    return {
      openRounds: raw.openRounds,
      pendingReviews: raw.pendingReviews,
      overdue72h: raw.overdue,
      medianHoursToSubmit: medianHours(raw.submitDurations),
      roundsInPeriod: raw.roundsInPeriod,
      autoApprovedRounds: raw.autoApprovedRounds,
      waivedRounds: raw.waivedRounds,
      byBoard: boards.map((b) => ({ boardId: b.id, boardName: b.name, enabled: parseBoardReview(b.review).enabled, openRounds: raw.openRoundsByBoard.get(b.id) ?? 0 })),
    };
  }
}
