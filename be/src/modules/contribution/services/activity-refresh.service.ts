import { LIMITS } from "../../../core/constants/limits";
import { addDaysToLocalDate, diffLocalDates, localDate, localDayRangeUtc } from "../../../core/utils/local-date";
import { logger } from "../../../infrastructure/logger";
import type { ActivityCell, BoardRef, BoardState } from "../entities/contribution.interface";
import type { IActivityDailyRepository } from "../repositories/activity-daily.repository.interface";
import type { ActivityKind, IActivitySourceRepository, SourceCount } from "../repositories/activity-source.repository.interface";
import type { IContributionDirectory } from "../repositories/contribution-directory.repository.interface";
import type { IContributionSourceRepository } from "../repositories/contribution-source.repository.interface";
import type { IContributionStateRepository } from "../repositories/contribution-state.repository.interface";
import type { IContribConfigPort } from "./contribution.ports";

export interface ActivityRefreshDeps {
  daily: IActivityDailyRepository;
  activitySource: IActivitySourceRepository;
  boardSource: IContributionSourceRepository;
  states: IContributionStateRepository;
  directory: IContributionDirectory;
  config: IContribConfigPort;
  now?: () => Date;
}

/** Không lùi quá ngần này ngày khi lấp lịch sử lần đầu (heatmap chỉ có nghĩa với dữ liệu gần; chặn truy vấn khổng lồ). */
const BACKFILL_MAX_DAYS = 1100;
const BOARD_PAGE = 200;
/** Nhìn lại ngần này giờ khi đối soát hằng đêm: đủ phủ cả ngày hôm qua + trễ giờ của job. */
const RECONCILE_LOOKBACK_HOURS = 48;
/** Cận của lần dựng lại TOÀN BỘ: xoá cả ô nằm ngoài khoảng tính (ô theo múi giờ cũ có thể lệch một ngày ra ngoài `[ngày tạo bảng, hôm nay]`). */
const DATE_MIN = "0000-01-01";
const DATE_MAX = "9999-12-31";

/** Phần state mà quyết định làm mới heatmap cần. */
export type ActivityRefreshState = Pick<BoardState, "activityRefreshedAt" | "activityDirtyAt" | "activityTimezone">;

/**
 * Cần dựng lại TOÀN BỘ lịch sử khi chưa từng làm mới hoặc các ô đã lưu theo múi giờ khác múi giờ hiện hành (`pm.timezone` đổi ⇒ ngày của cùng một hoạt động
 * đổi ⇒ chỉ tính lại vài ngày gần nhất sẽ để lại ô lệch ngày ở phần cũ).
 */
export function needsFullBackfill(state: Pick<BoardState, "activityRefreshedAt" | "activityTimezone"> | null, timezone: string): boolean {
  return state === null || state.activityRefreshedAt === null || state.activityTimezone !== timezone;
}

const KIND_FIELD: Record<ActivityKind, keyof Pick<ActivityCell, "taskEvents" | "checklistEvents" | "commentEvents" | "reviewEvents">> = {
  task: "taskEvents",
  checklist: "checklistEvents",
  comment: "commentEvents",
  review: "reviewEvents",
};

/** Gộp các dòng đếm theo nguồn thành ô `(người, ngày)` — hàm THUẦN. */
export function toCells(board: { id: string; workspaceId: string }, counts: readonly SourceCount[]): ActivityCell[] {
  const cells = new Map<string, ActivityCell>();
  for (const c of counts) {
    const key = `${c.userId}|${c.date}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = { boardId: board.id, workspaceId: board.workspaceId, userId: c.userId, date: c.date, taskEvents: 0, checklistEvents: 0, commentEvents: 0, reviewEvents: 0 };
      cells.set(key, cell);
    }
    cell[KIND_FIELD[c.kind]] += c.count;
  }
  return [...cells.values()];
}

/**
 * Tính lại ô heatmap TỪ NGUỒN (p4-06 be.md §5.6) bằng `$set` — không bao giờ `$inc` nên chạy lại bao nhiêu lần cũng cùng kết quả. Ba đường vào:
 *  - `aggregateDirty` (cron 15 phút): bảng bị đánh dấu "bẩn" bởi sink `task.events`/lượt chấm → tính lại `activityLiveDays` ngày gần nhất;
 *  - `refreshIfStale` (khi có người xem): giới hạn `heatmapFreshSeconds` — phủ cả thay đổi không phát sự kiện (tick checklist, kéo thẻ…);
 *  - `reconcileRecent` (cron 01:30): mọi bảng vừa có thay đổi trong 48 giờ, phủ cả ngày hôm qua (kể cả bình luận bị xoá làm ô giảm).
 * Lần đầu một bảng được làm mới, hoặc khi múi giờ đã đổi so với lần dựng trước → lấp toàn bộ lịch sử từ ngày tạo bảng (một aggregation/nguồn) và dọn ô cũ.
 */
export class ActivityRefreshService {
  private readonly now: () => Date;

  constructor(private readonly d: ActivityRefreshDeps) {
    this.now = d.now ?? (() => new Date());
  }

  /** Làm mới nếu quá hạn tươi (hoặc chưa từng làm mới / múi giờ đã đổi); trả `true` nếu có làm. */
  async refreshIfStale(board: BoardRef, timezone: string, state: ActivityRefreshState): Promise<boolean> {
    const full = needsFullBackfill(state, timezone);
    const { activityRefreshedAt: refreshedAt, activityDirtyAt: dirtyAt } = state;
    const fresh = !full && refreshedAt !== null && dirtyAt === null && this.now().getTime() - refreshedAt.getTime() < LIMITS.contribution.heatmapFreshSeconds * 1000;
    if (fresh) return false;
    await this.refreshBoard(board, timezone, full);
    return true;
  }

  /**
   * `backfill` → từ ngày tạo bảng và THAY toàn bộ ô của bảng (kể cả ngoài khoảng), rồi ghi múi giờ đã dùng; ngược lại chỉ `activityLiveDays` ngày gần nhất và KHÔNG
   * khẳng định múi giờ (làm mới một phần không sửa được ô cũ — lần sau `needsFullBackfill` vẫn báo lệch và dựng lại đủ).
   */
  async refreshBoard(board: BoardRef, timezone: string, backfill: boolean, extraDays = 0): Promise<void> {
    const today = localDate(this.now(), timezone);
    const liveFrom = addDaysToLocalDate(today, -(LIMITS.contribution.activityLiveDays - 1 + extraDays));
    let fromDate = liveFrom;
    if (backfill) {
      const created = localDate(board.createdAt, timezone);
      const floor = addDaysToLocalDate(today, -BACKFILL_MAX_DAYS);
      fromDate = created < floor ? floor : created;
      if (fromDate > liveFrom) fromDate = liveFrom;
    }
    await this.refreshRange(board, timezone, fromDate, today, backfill);
  }

  private async refreshRange(board: BoardRef, timezone: string, fromDate: string, toDate: string, full: boolean): Promise<void> {
    const scope = { workspaceId: board.workspaceId, boardId: board.id };
    const from = localDayRangeUtc(fromDate, timezone).from;
    const to = localDayRangeUtc(toDate, timezone).to;
    const [tasks, comments, reviews] = await Promise.all([
      this.d.activitySource.countTaskActivity(scope, from, to, timezone),
      this.d.activitySource.countComments(scope, from, to, timezone),
      this.d.activitySource.countReviews(scope, from, to, timezone),
    ]);
    const cells = toCells(board, [...tasks, ...comments, ...reviews]);
    await this.d.daily.replaceRange(board.id, board.workspaceId, full ? DATE_MIN : fromDate, full ? DATE_MAX : toDate, cells);
    await this.d.states.setActivityRefreshed(board.id, this.now(), full ? timezone : undefined);
  }

  /** Job 15 phút: tối đa `activityDirtyBatchMax` bảng bẩn (cũ nhất trước). Một bảng lỗi không cản bảng khác; cờ chỉ xoá khi tính xong. */
  async aggregateDirty(): Promise<number> {
    const dirty = await this.d.states.listDirty(LIMITS.contribution.activityDirtyBatchMax);
    let done = 0;
    for (const state of dirty) {
      try {
        const board = await this.d.directory.getBoard(state.boardId);
        if (board) {
          const timezone = await this.d.config.timezone(board.workspaceId);
          await this.refreshBoard(board, timezone, needsFullBackfill(state, timezone));
        }
        if (state.activityDirtyAt) await this.d.states.clearActivityDirty(state.boardId, state.activityDirtyAt);
        done += 1;
      } catch (err) {
        logger.warn("[contribution] activity.aggregate lỗi ở một bảng, thử lại lượt sau", { boardId: state.boardId, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return done;
  }

  /** Cron 01:30: mọi bảng chưa lưu trữ có thay đổi trong 48 giờ — tính lại (hôm nay, hôm qua, hôm kia). Trả số bảng đã xử lý. */
  async reconcileRecent(): Promise<number> {
    const since = new Date(this.now().getTime() - RECONCILE_LOOKBACK_HOURS * 3_600_000);
    let after: string | null = null;
    let done = 0;
    for (;;) {
      const page = await this.d.boardSource.listBoardsTouchedSince(since, BOARD_PAGE, after);
      for (const ref of page) {
        try {
          const board = await this.d.directory.getBoard(ref.id);
          if (!board) continue;
          const [state, timezone] = await Promise.all([this.d.states.get(board.id), this.d.config.timezone(board.workspaceId)]);
          await this.refreshBoard(board, timezone, needsFullBackfill(state, timezone), 1);
          done += 1;
        } catch (err) {
          logger.warn("[contribution] activity.reconcile lỗi ở một bảng", { boardId: ref.id, error: err instanceof Error ? err.message : String(err) });
        }
      }
      if (page.length < BOARD_PAGE) break;
      after = page[page.length - 1].id;
    }
    return done;
  }
}

/** Số ngày lịch của khoảng `[from, to]` gồm cả hai đầu. */
export const inclusiveDays = (from: string, to: string): number => diffLocalDates(from, to) + 1;
