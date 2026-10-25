import { LIMITS } from "../../../core/constants/limits";
import { logger } from "../../../infrastructure/logger";
import type { ContributionReadPort } from "../../../shared/ports/contribution-read.port";
import type { CareerVisibility } from "../../career/public";
import type { MemberStats, PortfolioSnapshot } from "../entities/portfolio.interface";
import type { IPortfolioSourceRepository } from "../repositories/portfolio-source.repository.interface";

export const SNAPSHOT_PORT_TIMEOUT_MS = 3000;

/** Số liệu chính (thẻ/story points) không đọc được — KHÔNG được ghi đè snapshot cũ bằng số 0. */
export class SnapshotUnavailableError extends Error {
  constructor() {
    super("Không đọc được số liệu đóng góp");
    this.name = "SnapshotUnavailableError";
  }
}

export interface CareerVisibilityReader {
  visibilityOf(userId: string): Promise<CareerVisibility>;
}

export interface CaptureOptions {
  /** Có lấy TÊN đồng đội (đã lọc theo đồng ý) — `false` ⇒ `namedTeammates` luôn rỗng. */
  showTeammates: boolean;
  /** Snapshot trước đó — giá trị phụ (tệp, đồng đội, điểm đóng góp) rơi về đây khi cổng phụ lỗi/quá hạn thay vì bị ghi 0/null. */
  previous?: PortfolioSnapshot | null;
}

async function bounded<T>(promise: Promise<T>, ms: number): Promise<{ ok: true; value: T } | { ok: false }> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const value = await Promise.race([promise, new Promise<never>((_r, reject) => (timer = setTimeout(() => reject(new Error(`quá ${ms}ms`)), ms)))]);
    return { ok: true, value };
  } catch (err) {
    logger.warn("[portfolio] cổng đọc số liệu lỗi/quá hạn", { error: err instanceof Error ? err.message : String(err) });
    return { ok: false };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * `PortfolioSnapshotService` — chụp số liệu hệ thống ghi nhận cho MỘT dự án (be.md §5). Gọi song song các cổng đọc, mỗi cổng bị chặn `SNAPSHOT_PORT_TIMEOUT_MS`; lỗi cổng phụ → giữ giá trị
 * của snapshot trước (hoặc `null`/0 khi chưa có). Quyền riêng tư: điểm đóng góp CHỈ khi chủ hồ sơ bật `showContribution`; tên đồng đội CHỈ của người đã bật
 * `appearInOthersPortfolios` (và tài khoản còn ACTIVE), và CHỈ khi dự án bật `showTeammates`.
 */
export class PortfolioSnapshotService {
  constructor(
    private readonly source: IPortfolioSourceRepository,
    private readonly contribution: ContributionReadPort,
    private readonly career: CareerVisibilityReader,
    private readonly timeoutMs: number = SNAPSHOT_PORT_TIMEOUT_MS
  ) {}

  /** Số thẻ hoàn thành được tính cho người này ở nhóm (0 = không đủ điều kiện thêm dự án). */
  async tasksDone(userId: string, workspaceId: string): Promise<number> {
    return (await this.source.memberStats(userId, workspaceId))?.tasksDone ?? 0;
  }

  /** `null` khi không có thẻ hoàn thành nào được tính; ném `SnapshotUnavailableError` khi cổng số liệu chính lỗi. */
  async capture(userId: string, workspaceId: string, opts: CaptureOptions): Promise<PortfolioSnapshot | null> {
    const prev = opts.previous ?? null;
    const [stats, visibility, files, teammates] = await Promise.all([
      bounded(this.source.memberStats(userId, workspaceId), this.timeoutMs),
      bounded(this.career.visibilityOf(userId), this.timeoutMs),
      bounded(this.source.filesUploaded(userId, workspaceId), this.timeoutMs),
      this.teammates(userId, workspaceId, opts.showTeammates, prev),
    ]);
    if (!stats.ok) throw new SnapshotUnavailableError();
    if (stats.value === null) return null;

    const showContribution = visibility.ok ? visibility.value.showContribution : false;
    const score = showContribution ? await bounded(this.contribution.memberScore(workspaceId, userId), this.timeoutMs) : null;
    // `undefined` = cổng điểm lỗi/quá hạn (giữ giá trị cũ); `null` = cổng trả lời "chưa có điểm".
    const scoreValue = score !== null && score.ok ? score.value : undefined;
    const s = stats.value;
    return {
      tasksDone: s.tasksDone,
      storyPointsX10: s.storyPointsX10,
      onTimeRatePct: onTimeRate(s),
      contributionPctX10: !showContribution ? null : scoreValue === undefined ? (prev?.contributionPctX10 ?? null) : (scoreValue?.scoreX10 ?? null),
      contributionShareX10: !showContribution ? null : scoreValue === undefined ? (prev?.contributionShareX10 ?? null) : (scoreValue?.shareX10 ?? null),
      peerReviewAvgX10: peerReviewAvg(s),
      filesUploaded: files.ok ? files.value : (prev?.filesUploaded ?? 0),
      teammatesCount: teammates.count,
      namedTeammates: teammates.named,
      skillBadges: [],
    };
  }

  /** Chỉ tính lại phần đồng đội (đổi công tắc `showTeammates`) — rẻ, không đụng số liệu khác nên không lách được giới hạn "Làm mới". */
  async recaptureTeammates(userId: string, workspaceId: string, showTeammates: boolean, current: PortfolioSnapshot): Promise<PortfolioSnapshot> {
    const t = await this.teammates(userId, workspaceId, showTeammates, current);
    return { ...current, teammatesCount: t.count, namedTeammates: t.named };
  }

  private async teammates(userId: string, workspaceId: string, showTeammates: boolean, prev: PortfolioSnapshot | null): Promise<{ count: number; named: string[] }> {
    const fallback = { count: prev?.teammatesCount ?? 0, named: showTeammates ? (prev?.namedTeammates ?? []) : [] };
    const ids = await bounded(this.source.coAssignees(userId, workspaceId), this.timeoutMs);
    if (!ids.ok) return fallback;
    const users = await bounded(this.source.users(ids.value), this.timeoutMs);
    if (!users.ok) return fallback;
    const present = ids.value.filter((id) => {
      const u = users.value.get(id);
      return u !== undefined && u.status !== "ANONYMIZED";
    });
    if (!showTeammates || present.length === 0) return { count: present.length, named: [] };
    const consent = await bounded(this.source.teammateConsent(present), this.timeoutMs);
    if (!consent.ok) return { count: present.length, named: [] }; // an toàn: không rõ đồng ý ⇒ không hiện tên
    const named = present
      .filter((id) => consent.value.has(id) && users.value.get(id)?.status === "ACTIVE")
      .map((id) => users.value.get(id)?.name ?? "")
      .filter((n) => n.length > 0)
      .sort((a, b) => a.localeCompare(b, "vi"))
      .slice(0, LIMITS.portfolio.namedTeammatesMax);
    return { count: present.length, named };
  }
}

const onTimeRate = (s: MemberStats): number | null => (s.tasksWithDue > 0 ? Math.round((100 * s.tasksOnTime) / s.tasksWithDue) : null);
const peerReviewAvg = (s: MemberStats): number | null => (s.reviewCount > 0 ? Math.round((s.peerScoreWeightedSum / s.reviewCount) * 10) : null);
