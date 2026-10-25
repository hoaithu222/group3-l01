import { LIMITS } from "../../../core/constants/limits";
import { VersionConflictError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { DOMAIN_EVENTS, eventKeys, type SrReviewedPayload } from "../../../shared/events/domain-events";
import { createBurnoutSignalPort } from "../../burnout";
import type { ReviewDto } from "../dtos";
import type { SrProgress } from "../entities/sr.interface";
import { UniqueViolationError } from "../repositories/errors";
import { srErrors, studyErrors } from "../study.errors";
import { localDate, startOfNextLocalDay } from "./local-date";
import { newBudgets } from "./sr-budget";
import { toProgressDto, type SrProgressDto } from "./sr.presenter";
import { withSrClock, type ResolvedSrDeps, type SrDeps } from "./sr.deps";
import { RATING_GRADE, review as sm2Review } from "./sm2";

const DAY_MS = 86_400_000;

// p7-03 be.md §5 "Collector" — cổng burnout radar: ghi MỘT tín hiệu hoạt động cho người vừa ôn xong một lượt SR (cổng tự kiểm đã bật theo dõi chưa, không bao giờ ném lỗi).
const burnoutSignal = createBurnoutSignalPort();

export interface SrReviewResult {
  progress: SrProgressDto;
  remainingToday: number;
}

/**
 * Một lượt ôn (`POST /sr/review`, p4-02 be.md §5.6): idempotent theo `clientReviewId` (trùng → trả tiến độ hiện tại), kiểm quyền bộ
 * TẠI LÚC ôn (mất quyền → tạm ngừng + 404), `reviewsPerDayMax`, rồi trong MỘT transaction: `SrReviewLog` (câu lệnh ĐẦU — trùng khoá
 * thoát callback), CAS `version` + SM-2, outbox `sr.reviewed` (mỗi thẻ mỗi ngày MỘT sự kiện — `dedupeKey` unique nên KIỂM trước, không dựa P2002).
 */
export class SrReviewService {
  private readonly d: ResolvedSrDeps;

  constructor(deps: SrDeps) {
    this.d = withSrClock(deps);
  }

  async review(user: AuthUser, dto: ReviewDto): Promise<SrReviewResult> {
    const d = this.d;
    const now = d.now();
    const tz = await d.users.getTimezone(user.id);

    let row = await d.progress.findByUserItem(user.id, dto.itemId);
    if (!row) throw studyErrors.notFound();
    if (await d.logs.findByClientId(user.id, dto.clientReviewId)) return this.result(row, tz, now);

    row = await this.ensureViewable(user, row);
    if (row.status === "SUSPENDED") throw srErrors.suspended();
    const item = await d.items.findById(row.itemId);
    if (!item || item.setId !== row.setId) {
      await d.progress.deleteByItems([row.itemId]);
      throw studyErrors.notFound();
    }

    const reviewedAt = this.clamp(dto.reviewedAt ?? now, now);
    const day = localDate(reviewedAt, tz);
    if ((await d.logs.countByDate(user.id, day)) >= LIMITS.sr.reviewsPerDayMax) throw srErrors.dailyLimit(LIMITS.sr.reviewsPerDayMax);

    const firstToday = !(await d.logs.existsForItemDate(user.id, row.itemId, day));
    const next = sm2Review(row, dto.rating, reviewedAt, tz);
    const current = row;

    try {
      const updated = await d.tx.run(async (tx) => {
        await d.logs.create(
          {
            userId: user.id,
            itemId: current.itemId,
            setId: current.setId,
            clientReviewId: dto.clientReviewId,
            rating: dto.rating,
            grade: RATING_GRADE[dto.rating],
            prevInterval: current.interval,
            newInterval: next.interval,
            localDate: day,
            reviewedAt,
          },
          tx
        );
        const saved = await d.progress.updateIf(current.id, current.version, next, tx);
        if (!saved) throw new VersionConflictError(current.version);
        if (firstToday) {
          const payload: SrReviewedPayload = {
            event: DOMAIN_EVENTS.SR_REVIEWED,
            userId: user.id,
            itemId: current.itemId,
            setId: current.setId,
            grade: RATING_GRADE[dto.rating],
            reviewedAt: reviewedAt.toISOString(),
            localDate: day,
          };
          await d.outbox.add(tx, {
            type: DOMAIN_EVENTS.SR_REVIEWED,
            aggregateType: "SrProgress",
            aggregateId: current.id,
            queue: "gamification",
            jobName: "xp.consume",
            dedupeKey: eventKeys.srReviewed(user.id, day, current.itemId),
            payload: payload as unknown as Record<string, unknown>,
          });
        }
        return saved;
      });
      // Ngoài transaction DB (Redis, best-effort) — chỉ tới đây khi lượt ôn THỰC SỰ mới ghi (nhánh trùng `clientReviewId` đã return sớm ở trên).
      await burnoutSignal.recordEvent(user.id, reviewedAt, dto.clientReviewId);
      return this.result(updated, tz, now);
    } catch (err) {
      // Hai lượt đồng thời cùng `clientReviewId`: bên thua thoát tx (đã rollback) → trả tiến độ do bên thắng ghi.
      if (err instanceof UniqueViolationError) return this.result((await d.progress.findByUserItem(user.id, dto.itemId)) ?? row, tz, now);
      throw err;
    }
  }

  /** Bộ không còn đọc được → tạm ngừng + 404; thẻ đang tạm ngừng do mất quyền mà nay đọc lại được → mở lại. */
  private async ensureViewable(user: AuthUser, row: SrProgress): Promise<SrProgress> {
    const d = this.d;
    const set = await d.sets.findById(row.setId);
    if (!set || !(await d.access.canView(user, set))) {
      await d.progress.suspendBySets(user.id, [row.setId], !set || set.status !== "ACTIVE" ? "SET_HIDDEN" : "LOST_ACCESS");
      throw studyErrors.notFound();
    }
    if (row.status !== "SUSPENDED") return row;
    await d.progress.reopenBySet(user.id, row.setId);
    return (await d.progress.findByUserItem(user.id, row.itemId)) ?? row;
  }

  private clamp(at: Date, now: Date): Date {
    return new Date(Math.min(Math.max(at.getTime(), now.getTime() - DAY_MS), now.getTime()));
  }

  private async result(row: SrProgress, tz: string, now: Date): Promise<SrReviewResult> {
    const d = this.d;
    const endOfToday = startOfNextLocalDay(now, tz);
    const due = await d.progress.countDue(row.userId, endOfToday);
    const fresh = (await newBudgets(d, row.userId, tz, now)).reduce((n, b) => n + b.available, 0);
    return { progress: toProgressDto(row), remainingToday: due + fresh };
  }
}
