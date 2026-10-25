import { AppError, ScopeNotFoundError } from "../../../core/exceptions";
import { HttpStatusCode } from "../../../core/constants/http-status";
import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import { addDaysToLocalDate, diffLocalDates } from "../../../core/utils/local-date";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { ActivityDayRow, IActivityDailyRepository } from "../repositories/activity-daily.repository.interface";
import type { IContributionDirectory } from "../repositories/contribution-directory.repository.interface";
import type { IContributionStateRepository } from "../repositories/contribution-state.repository.interface";
import type { ContributionAccess } from "./contribution-access";
import type { ContributionContextLoader } from "./contribution-context";
import { needsFullBackfill, type ActivityRefreshService } from "./activity-refresh.service";
import type { IContribConfigPort } from "./contribution.ports";

export interface HeatmapQuery {
  userId?: string;
  from: string;
  to: string;
}

/** Chỉ ngày + số đếm — KHÔNG giờ, KHÔNG id hoạt động/thẻ (riêng tư: không lộ nhịp làm việc trong ngày). */
export interface HeatmapDayDto {
  date: string;
  total: number;
  task: number;
  checklist: number;
  comment: number;
  review: number;
}

export interface HeatmapDto {
  timezone: string;
  from: string;
  to: string;
  userId?: string;
  days: HeatmapDayDto[];
  maxTotal: number;
}

export interface HeatmapDeps {
  access: ContributionAccess;
  context: ContributionContextLoader;
  refresh: ActivityRefreshService;
  daily: IActivityDailyRepository;
  states: IContributionStateRepository;
  directory: IContributionDirectory;
  config: IContribConfigPort;
}

const rangeError = (from: string, to: string): AppError =>
  new AppError(ErrorMessages[ErrorCode.CONTRIB_004], HttpStatusCode.BAD_REQUEST, ErrorCode.CONTRIB_004, { from, to, maxDays: LIMITS.contribution.heatmapRangeMaxDays });

/** `from ≤ to` và độ dài khoảng (`to − from`) < `heatmapRangeMaxDays` — vượt → `400 CONTRIB_004`. */
export function assertHeatmapRange(from: string, to: string): void {
  if (from > to || diffLocalDates(from, to) >= LIMITS.contribution.heatmapRangeMaxDays) throw rangeError(from, to);
}

/** Gộp các ô theo ngày và điền 0 cho ngày không có bản ghi (khoảng liên tục từ `from` tới `to`). */
export function foldDays(rows: readonly ActivityDayRow[], from: string, to: string): { days: HeatmapDayDto[]; maxTotal: number } {
  const byDate = new Map<string, HeatmapDayDto>();
  for (const r of rows) {
    const day = byDate.get(r.date) ?? { date: r.date, total: 0, task: 0, checklist: 0, comment: 0, review: 0 };
    day.task += r.taskEvents;
    day.checklist += r.checklistEvents;
    day.comment += r.commentEvents;
    day.review += r.reviewEvents;
    day.total += r.total;
    byDate.set(r.date, day);
  }
  const days: HeatmapDayDto[] = [];
  for (let date = from; date <= to; date = addDaysToLocalDate(date, 1)) {
    days.push(byDate.get(date) ?? { date, total: 0, task: 0, checklist: 0, comment: 0, review: 0 });
  }
  return { days, maxTotal: days.reduce((m, d) => Math.max(m, d.total), 0) };
}

/** Heatmap theo ngày của bảng hoặc cả nhóm (p4-06 be.md §5.6) — thành viên OWNER/ADMIN/MEMBER xem; khách/người ngoài `404`. */
export class HeatmapService {
  constructor(private readonly d: HeatmapDeps) {}

  async boardHeatmap(user: AuthUser, boardId: string, query: HeatmapQuery): Promise<HeatmapDto> {
    const board = await this.d.access.readBoard(user, boardId);
    assertHeatmapRange(query.from, query.to);
    if (query.userId && !(await this.d.directory.isKnownMember(board.workspaceId, query.userId))) throw new ScopeNotFoundError();
    const ctx = await this.d.context.load(board);
    // Làm mới có giới hạn tần suất (phủ thay đổi không phát sự kiện: tick checklist, kéo thẻ…). Lỗi làm mới không cản việc đọc ô đã có.
    await this.d.refresh.refreshIfStale(board, ctx.timezone, ctx.state).catch(() => undefined);
    const rows = await this.d.daily.list({ boardId, userId: query.userId, from: query.from, to: query.to });
    return this.dto(ctx.timezone, query, rows);
  }

  async workspaceHeatmap(user: AuthUser, workspaceId: string, query: HeatmapQuery): Promise<HeatmapDto> {
    await this.d.access.readWorkspace(user, workspaceId);
    assertHeatmapRange(query.from, query.to);
    if (query.userId && !(await this.d.directory.isKnownMember(workspaceId, query.userId))) throw new ScopeNotFoundError();
    const timezone = await this.d.config.timezone(workspaceId);
    await this.refreshStaleBoards(workspaceId, timezone);
    const rows = await this.d.daily.list({ workspaceId, userId: query.userId, from: query.from, to: query.to });
    return this.dto(timezone, query, rows);
  }

  /**
   * Bảng của nhóm đang có hoạt động mới chưa được tính → tính ngay để heatmap nhóm không trễ tới 15 phút; bảng có ô lưu theo múi giờ khác múi giờ hiện hành
   * (admin vừa đổi `pm.timezone`) → dựng lại đủ lịch sử để heatmap nhóm không lẫn hai múi giờ. Nhóm có tối đa `LIMITS.board.perWorkspaceMax` bảng nên chi phí có trần.
   */
  private async refreshStaleBoards(workspaceId: string, timezone: string): Promise<void> {
    const stale = (await this.d.states.listByWorkspace(workspaceId)).filter(
      (s) => s.activityDirtyAt !== null || (s.activityRefreshedAt !== null && needsFullBackfill(s, timezone))
    );
    await Promise.all(
      stale.map(async (state) => {
        const board = await this.d.directory.getBoard(state.boardId);
        if (!board) return;
        await this.d.refresh.refreshBoard(board, timezone, needsFullBackfill(state, timezone));
        if (state.activityDirtyAt) await this.d.states.clearActivityDirty(state.boardId, state.activityDirtyAt);
      })
    ).catch(() => undefined);
  }

  private dto(timezone: string, query: HeatmapQuery, rows: readonly ActivityDayRow[]): HeatmapDto {
    const { days, maxTotal } = foldDays(rows, query.from, query.to);
    return { timezone, from: query.from, to: query.to, ...(query.userId && { userId: query.userId }), days, maxTotal };
  }
}
