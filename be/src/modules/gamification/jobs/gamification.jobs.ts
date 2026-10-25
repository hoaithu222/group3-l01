import { defineCron, enqueue, registerJob, toSafeJobId } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { registerTaskEventSink, TASK_EVENTS } from "../../projects";
import { registerGamificationNotificationTypes } from "../notifications/gamification.notification-types";
import { getGamificationContainer } from "../gamification.container";

registerGamificationNotificationTypes();

/**
 * Job của gamification (p4-03 be.md §7) — file side-effect nạp qua `register-jobs.ts` (worker không import `router.ts`).
 *
 * QUY ƯỚC OUTBOX/FAN-OUT (đối chiếu mã, p4-03 be.md §16): mỗi cặp (queue, jobName) chỉ MỘT processor (`registerJob` là `Map.set` — đăng ký lần hai GHI ĐÈ âm thầm) và
 * `dedupeKey` outbox là unique ⇒ "một sự kiện nhiều consumer" đi bằng (a) sink registry sau MỘT processor (`task.events` của `projects`) hoặc (b) producer ghi MỘT dòng outbox
 * RIÊNG cho mỗi consumer trong cùng transaction. Ở đây:
 *  - `task.completed` (đi qua `notifications/task.events`): sink `p4-03.xp` chỉ XẾP tiếp `gamification/xp.consume` (BullMQ dedupe theo jobId, retry của `task.events` bao phủ lỗi xếp) để XP
 *    chạy ở queue `gamification` (concurrency mặc định 5 — ít write-conflict hơn queue `notifications` 20).
 *  - `quiz.scored`/`sr.reviewed` (p4-02), `review.submitted` (p4-05), `study-set.published` (p4-01), `roadmap.lesson-completed` (p4-07): producer ghi THẲNG dòng outbox `gamification/xp.consume`.
 */
registerJob("gamification", "xp.consume", async (job) => {
  const recorded = await getGamificationContainer().xpHandler.handle(job.data, String(job.id ?? ""));
  if (recorded > 0) logger.debug("[xp.consume] Đã ghi nhận XP", { recorded, id: job.id });
});

registerTaskEventSink("p4-03.xp", async (payload) => {
  if (payload.event !== TASK_EVENTS.COMPLETED) return;
  await enqueue("gamification", "xp.consume", payload, { jobId: toSafeJobId(`task.completed:task:${payload.taskId}:c${payload.completionCount}`) });
});

/** `xp.awarded` (queue `gamification`) — CHƯA có consumer (p7-02 coins). Processor rỗng để job không "không có processor" → failed; p7-02 thay bằng xử lý thật (đăng ký SAU file này). */
registerJob("gamification", "xp.awarded", () => Promise.resolve());

registerJob("notifications", "gamification.level-up", async (job) => {
  await getGamificationContainer().levelUp.handle(job.data);
});

registerJob("gamification", "badge.backfill", async (job) => {
  const { badgeId } = job.data as { badgeId?: string };
  if (!badgeId) return;
  const granted = await getGamificationContainer().badges.backfill(badgeId);
  logger.info("[badge.backfill] Đã cấp huy hiệu cho người đủ điều kiện", { badgeId, granted });
});

registerJob("cron", "streak.check", async () => {
  const reset = await getGamificationContainer().streaks.run();
  if (reset > 0) logger.info("[streak.check] Đã đặt lại chuỗi đã gãy", { reset });
});

defineCron({ schedulerId: "streak.check", queue: "cron", jobName: "streak.check", pattern: "5 * * * *", opts: { attempts: 1 } });

/** `UserAnonymizer` ghi dòng outbox RIÊNG `gamification.user-anonymized:user:<id>` (queue `gamification`). Idempotent. */
registerJob("gamification", "gamification.user-anonymized", async (job) => {
  const { userId } = job.data as { userId?: string };
  if (!userId) return;
  const counts = await getGamificationContainer().userData.erase(userId);
  logger.info("[gamification.user-anonymized] Đã xoá dữ liệu gamification cá nhân", { userId, ...counts });
});
