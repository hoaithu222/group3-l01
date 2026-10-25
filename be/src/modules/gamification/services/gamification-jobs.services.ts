import { localDate, localHour, addDaysToLocalDate } from "../../../core/utils/local-date";
import { logger } from "../../../infrastructure/logger";
import { DOMAIN_EVENTS, levelUpSchema, quizScoredSchema, reviewSubmittedSchema, roadmapLessonCompletedSchema, srReviewedSchema, studySetPublishedSchema } from "../../../shared/events/domain-events";
import { GAMIFICATION_NOTIFICATION_TYPES } from "../notifications/gamification.notification-types";
import type { IUserBadgeRepository } from "../repositories/user-badge.repository.interface";
import type { IUserGamificationRepository } from "../repositories/user-gamification.repository.interface";
import type { IXpEventRepository } from "../repositories/xp-event.repository.interface";
import type { IGamNotifier, ITxRunner } from "../repositories/tx";
import type { IGamEmitter } from "./gamification.ports";
import type { XpConsumerService } from "./xp-consumer.service";
import { mapQuizScored, mapReviewSubmitted, mapRoadmapLessonCompleted, mapSrReviewed, mapStudySetPublished, mapTaskCompleted, type TaskCompletedInput, type XpInput } from "./xp-source-mapper";

/**
 * Bộ định tuyến sự kiện miền → `XpInput[]` (p4-03 be.md §5.1): job `gamification/xp.consume` mang `payload.event` = `task.completed` | `quiz.scored` |
 * `sr.reviewed` | `review.submitted` | `study-set.published` | `roadmap.lesson-completed` (p4-07). Payload sai dạng → bỏ qua có log (KHÔNG throw — retry không làm nó đúng lên).
 */
export function mapDomainEvent(payload: unknown): XpInput[] | null {
  const event = (payload as { event?: unknown } | null)?.event;
  switch (event) {
    case "task.completed": {
      const p = payload as Partial<TaskCompletedInput> & { assigneeIds?: unknown };
      if (typeof p.taskId !== "string" || typeof p.workspaceId !== "string" || !Array.isArray(p.assigneeIds) || typeof p.completedAt !== "string") return null;
      return mapTaskCompleted({
        taskId: p.taskId,
        workspaceId: p.workspaceId,
        assigneeIds: p.assigneeIds.filter((x): x is string => typeof x === "string"),
        storyPoints: typeof p.storyPoints === "number" ? p.storyPoints : null,
        completedAt: p.completedAt,
        onTime: p.onTime === true,
        taskCreatedAt: typeof p.taskCreatedAt === "string" ? p.taskCreatedAt : undefined,
      });
    }
    case DOMAIN_EVENTS.QUIZ_SCORED: {
      const r = quizScoredSchema.safeParse(payload);
      return r.success ? mapQuizScored(r.data) : null;
    }
    case DOMAIN_EVENTS.SR_REVIEWED: {
      const r = srReviewedSchema.safeParse(payload);
      return r.success ? mapSrReviewed(r.data) : null;
    }
    case DOMAIN_EVENTS.REVIEW_SUBMITTED: {
      const r = reviewSubmittedSchema.safeParse(payload);
      return r.success ? mapReviewSubmitted(r.data) : null;
    }
    case DOMAIN_EVENTS.STUDY_SET_PUBLISHED: {
      const r = studySetPublishedSchema.safeParse(payload);
      return r.success ? mapStudySetPublished(r.data) : null;
    }
    case DOMAIN_EVENTS.ROADMAP_LESSON_COMPLETED: {
      const r = roadmapLessonCompletedSchema.safeParse(payload);
      return r.success ? mapRoadmapLessonCompleted(r.data) : null;
    }
    default:
      return null;
  }
}

/** Job `xp.consume`. Trả số lần ghi nhận MỚI (lặp = 0). */
export class XpEventHandler {
  constructor(private readonly consumer: XpConsumerService) {}

  async handle(payload: unknown, jobId: string): Promise<number> {
    const inputs = mapDomainEvent(payload);
    if (!inputs) {
      logger.warn("[xp.consume] payload không hợp lệ hoặc sự kiện lạ, bỏ qua", { jobId, event: (payload as { event?: unknown } | null)?.event });
      return 0;
    }
    return (await this.consumer.recordMany(inputs)).filter((s) => s === "RECORDED").length;
  }
}

/** Job `gamification.level-up` (queue `notifications`): thông báo LEVEL_UP — idempotent theo `dedupeKey` `level-up:<userId>:<to>` (`notify()` không ghi thêm khi người nhận đã có). */
export class LevelUpNotifier {
  constructor(private readonly d: { notifier: IGamNotifier; tx: ITxRunner }) {}

  async handle(payload: unknown): Promise<boolean> {
    const r = levelUpSchema.safeParse(payload);
    if (!r.success) return false;
    const key = `level-up:${r.data.userId}:${r.data.to}`;
    await this.d.tx.run((tx) =>
      this.d.notifier.notify(tx, {
        type: GAMIFICATION_NOTIFICATION_TYPES.LEVEL_UP,
        scope: null,
        source: { type: "UserLevel", id: key },
        refs: { level: r.data.to, from: r.data.from },
        recipients: [{ userId: r.data.userId }],
        dedupeKey: key,
      })
    );
    return true;
  }
}

/**
 * `streak.check` (cron `5 * * * *`, MỘT job tick TĨNH): múi giờ nào đang là giờ 0 (00:05–00:59) → đặt `streak = 0` cho người còn chuỗi mà `lastActiveDate` < hôm qua
 * (đã gãy) + phát `gamification:updated`. Chỉ để nhất quán/thông báo — hiển thị luôn tính lại khi đọc (`viewStreak`), nên job trễ vẫn đúng.
 */
export class StreakCheckService {
  constructor(private readonly d: { users: IUserGamificationRepository; emitter: IGamEmitter; now?: () => Date }) {}

  async run(): Promise<number> {
    const now = this.d.now?.() ?? new Date();
    let reset = 0;
    for (const tz of await this.d.users.listStreakTimezones()) {
      if (localHour(now, tz) !== 0) continue;
      const ids = await this.d.users.resetStaleStreaks(tz, addDaysToLocalDate(localDate(now, tz), -1));
      for (const g of await this.d.users.findMany(ids)) this.d.emitter.updated(g.userId, { xp: g.xp, level: g.level, streak: 0, newBadges: [] });
      reset += ids.length;
    }
    return reset;
  }
}

/** Ẩn danh hoá (D-02): xoá `UserGamification`/`UserBadge`/`XpDailyTotal`; `XpEvent` GIỮ (số liệu tổng không đổi, người đã ẩn danh bị lọc khỏi bảng xếp hạng). Idempotent. */
export class GamificationUserDataEraser {
  constructor(private readonly d: { users: IUserGamificationRepository; userBadges: IUserBadgeRepository; events: IXpEventRepository }) {}

  async erase(userId: string): Promise<{ gamification: number; badges: number; dailyTotals: number }> {
    return {
      gamification: await this.d.users.deleteByUser(userId),
      badges: await this.d.userBadges.deleteByUser(userId),
      dailyTotals: await this.d.events.deleteDailyTotalsByUser(userId),
    };
  }
}
