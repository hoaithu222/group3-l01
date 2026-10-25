import { CONTRIBUTION_FORMULA_VERSION } from "../../../core/constants/contribution";
import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import { logger } from "../../../infrastructure/logger";
import type { ContributionSnapshotRow, MemberContribution } from "../entities/contribution.interface";
import type { IContributionDirectory } from "../repositories/contribution-directory.repository.interface";
import type { IContributionSnapshotRepository } from "../repositories/contribution-snapshot.repository.interface";
import type { IContributionStateRepository } from "../repositories/contribution-state.repository.interface";
import type { ContributionAccess } from "./contribution-access";
import type { CalcResult } from "./contribution-calculator";
import type { BoardContext, ContributionContextLoader } from "./contribution-context";
import type { ContributionComputer } from "./contribution-computer";
import { presentReport, type ContributionReportDto } from "./contribution.presenter";
import type { IContribCache, IContribQueue } from "./contribution.ports";
import { parsePeriod, type Period } from "./period";
import { recomputeJobId } from "./recompute-job-id";

export interface ContributionServiceDeps {
  access: ContributionAccess;
  context: ContributionContextLoader;
  computer: ContributionComputer;
  snapshots: IContributionSnapshotRepository;
  states: IContributionStateRepository;
  directory: IContributionDirectory;
  cache: IContribCache;
  /** Xếp job tính lại khi snapshot còn theo múi giờ cũ (đọc báo cáo sau khi admin đổi `pm.timezone`). */
  queue: IContribQueue;
  now?: () => Date;
}

export interface ReportData {
  calc: CalcResult;
  computedAt: Date | null;
  stale: boolean;
}

export interface PeriodsDto {
  timezone: string;
  months: string[];
  weeks: string[];
}

const WEEKS_LISTED = 26;

const memberOf = (r: ContributionSnapshotRow): MemberContribution => ({
  userId: r.userId,
  storyPointsDone: r.storyPointsDone,
  tasksDone: r.tasksDone,
  unestimatedTasks: r.unestimatedTasks,
  tasksWithDue: r.tasksWithDue,
  tasksOnTime: r.tasksOnTime,
  tasksLate: r.tasksLate,
  reviewCount: r.reviewCount,
  peerScoreAvg: r.peerScoreAvg,
  components: r.components,
  weightsUsed: r.weightsUsed,
  score: r.score,
  share: r.share,
});

/** Đọc báo cáo (snapshot `ALL`/tháng, tuần tính khi xem), thẻ được tính theo người, danh sách kỳ, và tính lại snapshot (job). */
export class ContributionService {
  private readonly now: () => Date;

  constructor(private readonly d: ContributionServiceDeps) {
    this.now = d.now ?? (() => new Date());
  }

  async getReport(user: AuthUser, boardId: string, periodKey: string): Promise<ContributionReportDto> {
    const board = await this.d.access.readBoard(user, boardId);
    const ctx = await this.d.context.load(board);
    const period = parsePeriod(periodKey, ctx.timezone);
    const data = await this.reportData(ctx, period);
    return this.present(ctx, period, data);
  }

  /** Dựng DTO từ dữ liệu đã tính — dùng chung với xuất PDF. */
  async present(ctx: BoardContext, period: Period, data: ReportData): Promise<ContributionReportDto> {
    const ids = [...data.calc.members.map((m) => m.userId), ...(ctx.state.configChangedBy ? [ctx.state.configChangedBy] : [])];
    const users = await this.d.directory.getUsers(ctx.board.workspaceId, ids);
    return presentReport({ ctx, period, calc: data.calc, users, computedAt: data.computedAt, stale: data.stale });
  }

  /**
   * `ALL`/`M:*` đọc snapshot khi còn hiệu lực; thiếu snapshot, công thức vừa đổi, hoặc múi giờ vừa đổi mà job chưa tính xong → tính tại chỗ (không ghi).
   * `W:*` luôn tính tại chỗ, cache theo `(múi giờ, factsVersion, configVersion)`. `stale` = còn fact chưa vào snapshot.
   */
  async reportData(ctx: BoardContext, period: Period, opts: { fresh?: boolean } = {}): Promise<ReportData> {
    const { state, board } = ctx;
    const stale = state.factsVersion > state.computedVersion;
    const configFresh = !state.configChangedAt || (state.computedAt !== null && state.configChangedAt <= state.computedAt);
    // Ranh giới tháng và "cuối ngày hạn" phụ thuộc múi giờ: snapshot tính theo múi giờ khác múi giờ hiện hành là sai kỳ.
    const timezoneFresh = state.snapshotTimezone === ctx.timezone;

    if (!opts.fresh && period.kind !== "WEEK" && state.computedAt && configFresh && timezoneFresh) {
      const rows = await this.d.snapshots.listByPeriod(board.id, period.key);
      if (rows.length > 0) return { calc: this.fromSnapshot(rows), computedAt: state.computedAt, stale };
    }
    if (!opts.fresh && state.computedAt && !timezoneFresh) this.requestRetimezone(board.id);

    const cacheKey = `contrib:${board.id}:${period.key}:${ctx.timezone}:${state.factsVersion}:${state.configVersion}`;
    if (!opts.fresh && period.kind === "WEEK") {
      const cached = await this.d.cache.get<{ calc: CalcResult; computedAt: string }>(cacheKey);
      if (cached?.calc) return { calc: cached.calc, computedAt: new Date(cached.computedAt), stale: false };
    }
    const inputs = await this.d.computer.loadInputs(ctx);
    const calc = this.d.computer.computePeriod(inputs, ctx, period);
    const computedAt = this.now();
    if (period.kind === "WEEK") await this.d.cache.set(cacheKey, { calc, computedAt: computedAt.toISOString() }, LIMITS.contribution.weekCacheSeconds);
    return { calc, computedAt, stale: false };
  }

  async getPeriods(user: AuthUser, boardId: string): Promise<PeriodsDto> {
    const board = await this.d.access.readBoard(user, boardId);
    const ctx = await this.d.context.load(board);
    const inputs = await this.d.computer.loadInputs(ctx);
    return { timezone: ctx.timezone, ...this.d.computer.listPeriods(inputs, ctx.timezone, WEEKS_LISTED) };
  }

  /**
   * Job `contribution.recompute`: đọc `factsVersion` TRƯỚC khi đọc fact (fact tới sau sẽ có phiên bản lớn hơn nên báo cáo vẫn `stale` và một
   * job mới được xếp), tính `ALL` + mọi tháng có dữ liệu, thay TOÀN BỘ snapshot của bảng trong một transaction, rồi đặt `computedVersion`.
   */
  async recompute(boardId: string): Promise<{ periods: number; rows: number } | null> {
    const board = await this.d.directory.getBoard(boardId);
    if (!board) return null;
    const ctx = await this.d.context.load(board);
    const version = ctx.state.factsVersion;
    const inputs = await this.d.computer.loadInputs(ctx);
    const computedAt = this.now();

    const rows: ContributionSnapshotRow[] = [];
    const keys = this.d.computer.periodKeys(inputs, ctx.timezone);
    for (const key of keys) {
      const calc = this.d.computer.computePeriod(inputs, ctx, parsePeriod(key, ctx.timezone));
      for (const m of calc.members) {
        rows.push({
          ...m,
          workspaceId: board.workspaceId,
          boardId,
          periodKey: key,
          teamTasksDone: calc.totals.tasksDone,
          teamStoryPoints: calc.totals.storyPointsDone,
          formulaVersion: CONTRIBUTION_FORMULA_VERSION,
          computedAt,
        });
      }
    }
    await this.d.snapshots.replaceForBoard(boardId, rows);
    await this.d.states.markComputed(boardId, version, computedAt, ctx.timezone);
    return { periods: keys.length, rows: rows.length };
  }

  /** Không chờ và không ném lỗi: đường ĐỌC không được chậm/hỏng vì Redis (báo cáo đã tính tại chỗ đúng múi giờ; lượt quét đêm là lưới dự phòng). */
  private requestRetimezone(boardId: string): void {
    const { jobId, delayMs } = recomputeJobId(boardId, this.now().getTime());
    this.d.queue.enqueueRecompute(boardId, jobId, delayMs).catch((err: unknown) => {
      logger.warn("[contribution] không xếp được job tính lại sau khi đổi múi giờ", { boardId, error: err instanceof Error ? err.message : String(err) });
    });
  }

  private fromSnapshot(rows: ContributionSnapshotRow[]): CalcResult {
    const members = rows.map(memberOf).sort((a, b) => b.score - a.score || (a.userId < b.userId ? -1 : 1));
    return {
      members,
      totals: { storyPointsDone: rows[0].teamStoryPoints, tasksDone: rows[0].teamTasksDone },
      maxStoryPoints: Math.max(0, ...members.map((m) => m.storyPointsDone)),
    };
  }
}
