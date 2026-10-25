import { defineCron, registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { registerTaskEventSink } from "../../projects";
import { registerBurnoutModule } from "..";
import { getBurnoutContainer } from "../burnout.container";
import { BURNOUT_JOBS, type PurgePayload, type UserAnonymizedPayload } from "../services/burnout-events";
import { recordTaskActivity } from "../services/burnout-task-sink";

/**
 * Job của burnout radar (p7-03 be.md §7) — nạp bởi `infrastructure/queue/register-jobs.ts` ở CẢ API (PROCESS_ROLE=all) lẫn worker riêng. Worker không import `router.ts` nên đăng ký loại thông báo ngay đây.
 * Log CHỈ có số đếm và id job — KHÔNG có chỉ số/điểm/nhân tố, và không kèm định danh người dùng (dữ liệu sức khoẻ tinh thần).
 *
 *  - sink `p7-03.burnout` của `task.events`  — người thực hiện thao tác thẻ ĐÃ BẬT theo dõi → +1 sự kiện ở khe 15 phút hiện tại (collector tự bỏ qua người chưa bật).
 *  - `cron/wellbeing.evaluate` (mỗi giờ, phút 20, TĨNH) — người có giờ địa phương 05:xx: tổng hợp ngày vừa qua + chấm điểm + cảnh báo (≤ 1/24 giờ); đồng bộ tập "đã bật" trên Redis.
 *  - `cron/wellbeing.retention` (03:00) — xoá chỉ số/đánh giá quá 90 ngày.
 *  - `gamification/wellbeing.purge` — outbox ghi cùng lúc TẮT theo dõi: dọn Redis + xoá sót (bỏ qua nếu người dùng đã bật lại).
 *  - `gamification/wellbeing.user-anonymized` — `UserAnonymizer` ghi dòng outbox riêng: xoá sạch dữ liệu + dòng cài đặt.
 */
registerBurnoutModule();

registerTaskEventSink("p7-03.burnout", async (payload, jobId) => {
  await recordTaskActivity(getBurnoutContainer().collector, payload, jobId);
});

registerJob(BURNOUT_JOBS.evaluate.queue, BURNOUT_JOBS.evaluate.name, async () => {
  const report = await getBurnoutContainer().evaluation.run();
  if (report.failed > 0) logger.warn("[wellbeing.evaluate] Có người dùng đánh giá lỗi", report);
  else if (report.evaluated > 0) logger.info("[wellbeing.evaluate] Hoàn tất", report);
});

registerJob(BURNOUT_JOBS.retention.queue, BURNOUT_JOBS.retention.name, async () => {
  const swept = await getBurnoutContainer().privacy.sweepRetention();
  if (swept.dailies > 0 || swept.assessments > 0) logger.info("[wellbeing.retention] Đã xoá dữ liệu quá hạn lưu giữ", swept);
});

registerJob(BURNOUT_JOBS.purge.queue, BURNOUT_JOBS.purge.name, async (job) => {
  const { userId } = job.data as PurgePayload;
  if (!userId) {
    logger.warn("[wellbeing.purge] payload thiếu định danh người dùng, bỏ qua", { id: job.id });
    return;
  }
  const result = await getBurnoutContainer().privacy.purgeIfStillOptedOut(userId);
  logger.info("[wellbeing.purge] Hoàn tất", { id: job.id, skipped: result === null });
});

registerJob(BURNOUT_JOBS.onUserAnonymized.queue, BURNOUT_JOBS.onUserAnonymized.name, async (job) => {
  const { userId } = job.data as UserAnonymizedPayload;
  if (!userId) {
    logger.warn("[wellbeing.user-anonymized] payload thiếu định danh người dùng, bỏ qua", { id: job.id });
    return;
  }
  await getBurnoutContainer().privacy.purgeUser(userId, { removeSetting: true });
  logger.info("[wellbeing.user-anonymized] Đã xoá dữ liệu sức khoẻ học tập của tài khoản ẩn danh hoá", { id: job.id });
});

defineCron({ schedulerId: BURNOUT_JOBS.evaluate.name, queue: BURNOUT_JOBS.evaluate.queue, jobName: BURNOUT_JOBS.evaluate.name, pattern: "20 * * * *", opts: { attempts: 1 } });
defineCron({ schedulerId: BURNOUT_JOBS.retention.name, queue: BURNOUT_JOBS.retention.queue, jobName: BURNOUT_JOBS.retention.name, pattern: "0 3 * * *", opts: { attempts: 1 } });
