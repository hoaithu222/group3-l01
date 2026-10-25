import { defineCron, enqueue, registerJob, toSafeJobId } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { DOMAIN_EVENTS, skillBadgeEventSchema } from "../../../shared/events/domain-events";
import { registerTaskEventSink, TASK_EVENTS } from "../../projects";
import type { TaskEventPayload } from "../../projects";
import { getCareerContainer } from "../career.container";
import { registerCareerNotificationTypes } from "../notifications/career.notification-types";
import { dispatchSkillEvent, SKILL_EVENTS_JOB, SKILL_EVENTS_QUEUE } from "../services/skill-events";
import { REEVALUATE_ALL_JOB, REEVALUATE_QUEUE, REEVALUATE_SKILL_JOB } from "../services/skill-reevaluate.rows";

registerCareerNotificationTypes();

/**
 * Job của huy hiệu kỹ năng (p6-06 be.md §7) — file side-effect nạp qua `register-jobs.ts` (worker không import `router.ts`).
 *
 * NGUỒN: mọi outbox `task.*` đi qua MỘT processor `notifications/task.events` rồi tới sink đã đăng ký (KHÔNG sửa lõi `projects`). Sink `p6-06.skills`
 * chỉ XẾP `gamification/skill.progress` (jobId theo sự kiện + `completionCount`) để credit ghi ở queue `gamification` với retry riêng — lỗi ở đây không kéo
 * sink thông báo/XP/đóng góp chạy lại. `review.submitted` KHÔNG cần consumer riêng: điểm chấm đọc từ nguồn lúc `task.completed` (xem `SkillProgressService`).
 */
registerTaskEventSink("p6-06.skills", async (payload: TaskEventPayload) => {
  if (payload.event !== TASK_EVENTS.COMPLETED && payload.event !== TASK_EVENTS.REOPENED) return;
  const kind = payload.event === TASK_EVENTS.COMPLETED ? "task" : "reopen";
  await enqueue("gamification", "skill.progress", payload, { jobId: toSafeJobId(`skill.progress:${kind}:${payload.taskId}:c${payload.completionCount}`) });
});

registerJob("gamification", "skill.progress", async (job) => {
  const data = job.data as { event?: string };
  const svc = getCareerContainer().progressService;
  const n = data.event === TASK_EVENTS.REOPENED ? await svc.onTaskReopened(job.data) : await svc.onTaskCompleted(job.data);
  if (n > 0) logger.debug("[skill.progress] đã cập nhật credit kỹ năng", { id: job.id, event: data.event, credits: n });
});

/** Sự kiện RA `skill.unlocked|revoked|restored`: phát socket (chỉ khi mở khoá) rồi chuyển cho sink của p6-07/p6-08. */
registerJob(SKILL_EVENTS_QUEUE, SKILL_EVENTS_JOB, async (job) => {
  const parsed = skillBadgeEventSchema.safeParse(job.data);
  if (!parsed.success) {
    logger.warn("[skill.events] payload sai hợp đồng — bỏ qua", { id: job.id });
    return;
  }
  const e = parsed.data;
  if (e.event === DOMAIN_EVENTS.SKILL_UNLOCKED) {
    getCareerContainer().emitter.unlocked(e.userId, { v: 1, skillId: e.skillId, code: e.code, name: e.name, icon: e.icon, unlockedAt: e.at });
  }
  await dispatchSkillEvent(e);
});

registerJob(REEVALUATE_QUEUE, REEVALUATE_SKILL_JOB, async (job) => {
  const { skillId } = job.data as { skillId?: string };
  if (!skillId) return;
  const granted = await getCareerContainer().reconcile.reevaluateSkill(skillId);
  logger.info("[skill.reevaluate-skill] xong", { skillId, granted });
});

registerJob(REEVALUATE_QUEUE, REEVALUATE_ALL_JOB, async () => {
  const result = await getCareerContainer().reconcile.reevaluateAll();
  logger.info("[skill.reevaluate-all] xong", { ...result });
});

/** Cron TĨNH 02:30 — dựng lại tiến độ từ credit + cấp cho người đủ (đổi tiêu chí dễ hơn / bật kỹ năng). `skill_reconcile_fixed_total` = `fixed` trong log. */
registerJob("cron", "skill.reconcile", async () => {
  const result = await getCareerContainer().reconcile.nightly();
  logger.info("[skill.reconcile] xong", { ...result, metric: "skill_reconcile_fixed_total" });
});
defineCron({ schedulerId: "skill.reconcile", queue: "cron", jobName: "skill.reconcile", pattern: "30 2 * * *", opts: { attempts: 1 } });

/** Ẩn danh hoá tài khoản → xoá credit/tiến độ/huy hiệu/hồ sơ nghề nghiệp (idempotent). Producer: `UserAnonymizer` (module `users`) ghi dòng outbox RIÊNG `career.user-anonymized:user:<id>`. */
registerJob("gamification", "career.user-anonymized", async (job) => {
  const { userId } = job.data as { userId?: string };
  if (!userId) return;
  const counts = await getCareerContainer().userData.erase(userId);
  logger.info("[career.user-anonymized] Đã xoá dữ liệu nghề nghiệp cá nhân", { userId, ...counts });
});
