import { defineCron, registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { registerMentorModule } from "..";
import { getMentorContainer } from "../mentor.container";
import { MENTOR_ACCEPTED_JOB, MENTOR_ENDED_JOB, MENTOR_QUEUE, type MentorAcceptedPayload, type MentorEndedPayload } from "../services/mentor-events";

/**
 * Job của Mentor Connect (be.md §7) — nạp bởi `infrastructure/queue/register-jobs.ts` ở CẢ API (PROCESS_ROLE=all) lẫn worker riêng.
 * Worker không import `router.ts` nên đăng ký registry (loại thông báo, đích báo cáo `MENTOR_POST`, listener thu hồi quyền) ngay đây.
 *
 *  - `notifications/mentor.accepted-effects` (outbox): nhóm chat cố vấn + tin hệ thống + thông báo `mentor.accepted`.
 *  - `notifications/mentor.ended-effects` (outbox): gỡ khỏi nhóm chat + thu hồi khách + thông báo `mentor.ended`.
 *  - cron TĨNH `mentor.expire` (15 phút), `mentor.ending-soon` (mỗi giờ), `mentor.post-expire` (mỗi giờ) — KHÔNG scheduler theo thực thể.
 */
registerMentorModule();

registerJob(MENTOR_QUEUE, MENTOR_ACCEPTED_JOB, async (job) => {
  await getMentorContainer().effects.onAccepted(job.data as MentorAcceptedPayload);
});

registerJob(MENTOR_QUEUE, MENTOR_ENDED_JOB, async (job) => {
  await getMentorContainer().effects.onEnded(job.data as MentorEndedPayload);
});

const CRONS = [
  { name: "mentor.expire", pattern: "*/15 * * * *", run: () => getMentorContainer().cron.expireDue() },
  { name: "mentor.ending-soon", pattern: "7 * * * *", run: () => getMentorContainer().cron.notifyEndingSoon() },
  { name: "mentor.post-expire", pattern: "17 * * * *", run: () => getMentorContainer().cron.expirePosts() },
] as const;

for (const cron of CRONS) {
  registerJob("cron", cron.name, async () => {
    const { processed } = await cron.run();
    if (processed > 0) logger.info(`[${cron.name}] Đã xử lý`, { processed });
  });
  defineCron({ schedulerId: cron.name, queue: "cron", jobName: cron.name, pattern: cron.pattern, opts: { attempts: 1 } });
}
