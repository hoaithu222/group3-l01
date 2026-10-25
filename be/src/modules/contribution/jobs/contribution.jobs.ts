import type { Job } from "bullmq";
import { defineCron, enqueue, registerJob, toSafeJobId } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { registerTaskEventSink, TASK_EVENTS } from "../../projects";
import type { TaskEventPayload } from "../../projects";
import { getContributionContainer } from "../contribution.container";
import { registerContributionNotificationTypes } from "../notifications/contribution.notification-types";
import type { ReviewSubmittedInput } from "../services/contribution-facts.service";

registerContributionNotificationTypes();

/**
 * Job của báo cáo đóng góp (p4-06 be.md §7) — file side-effect nạp qua `register-jobs.ts` (worker không import `router.ts`).
 *
 * NGUỒN SỰ KIỆN (đối chiếu mã `projects`/p4-05, be.md §16 của p4-03): mọi outbox `task.*` đi qua MỘT processor `notifications/task.events` rồi tới các sink đã
 * đăng ký. Sink `p4-06.contribution` xử lý theo loại:
 *   - `task.completed` / `task.reopened` → xếp `reports/contribution.task-fact` (jobId theo sự kiện + `completionCount`) để fact được ghi ở queue `reports` với
 *     retry riêng — lỗi ở đây không kéo các sink khác (thông báo, XP) chạy lại;
 *   - sự kiện thẻ khác có người gây ra → chỉ đánh dấu bảng "bẩn" cho heatmap (không bao giờ ném lỗi).
 * `review.submitted` (p4-05) — producer ghi MỘT dòng outbox RIÊNG `reports/contribution.review-fact` (dedupeKey `contribution.review-fact:review:<id>`), cùng lý do
 * `dedupeKey` là unique. Thiếu dòng đó thì cron đối soát `contribution.reconcile` vẫn dựng lại lượt chấm từ `TaskReview` (chậm nhất tới đêm).
 */
registerTaskEventSink("p4-06.contribution", async (payload: TaskEventPayload) => {
  if (payload.event === TASK_EVENTS.COMPLETED || payload.event === TASK_EVENTS.REOPENED) {
    await enqueue("reports", "contribution.task-fact", payload, {
      jobId: toSafeJobId(`contribution.task-fact:${payload.event}:task:${payload.taskId}:c${payload.completionCount}`),
    });
    return;
  }
  await getContributionContainer().factsService.onTaskActivity(payload);
});

registerJob("reports", "contribution.task-fact", async (job) => {
  const payload = job.data as TaskEventPayload;
  const facts = getContributionContainer().factsService;
  if (payload.event === TASK_EVENTS.COMPLETED) await facts.onTaskCompleted(payload);
  else if (payload.event === TASK_EVENTS.REOPENED) await facts.onTaskReopened(payload);
});

registerJob("reports", "contribution.review-fact", async (job) => {
  const payload = job.data as ReviewSubmittedInput;
  if (!payload?.reviewId) {
    logger.warn("[contribution.review-fact] payload không có reviewId, bỏ qua", { id: job.id });
    return;
  }
  await getContributionContainer().factsService.onReviewSubmitted(payload);
});

/** Tính lại snapshot của MỘT bảng — chạy lại vô hại (ghi đè theo `factsVersion`). */
registerJob("reports", "contribution.recompute", async (job) => {
  const { boardId } = job.data as { boardId?: string };
  if (!boardId) return;
  const result = await getContributionContainer().reports.recompute(boardId);
  if (result) logger.debug("[contribution.recompute] xong", { boardId, ...result });
});

/** Xuất PDF: retry theo mặc định queue (3 lần, backoff mũ); lượt cuối thất bại → `FAILED` + thông báo, không ném lỗi nữa. */
registerJob("reports", "contribution.export", async (job: Job) => {
  const { exportId } = job.data as { exportId?: string };
  if (!exportId) return;
  const exportJobs = getContributionContainer().exportJobs;
  try {
    await exportJobs.run(exportId);
  } catch (err) {
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade + 1 >= attempts) {
      await exportJobs.fail(exportId, err);
      return;
    }
    throw err;
  }
});

/** Cron TĨNH mỗi 15 phút: tính lại ô heatmap của các bảng bị đánh dấu "bẩn". */
registerJob("reports", "activity.aggregate", async () => {
  const done = await getContributionContainer().refresh.aggregateDirty();
  if (done > 0) logger.debug("[activity.aggregate] đã tính lại heatmap", { boards: done });
});
defineCron({ schedulerId: "activity.aggregate", queue: "reports", jobName: "activity.aggregate", pattern: "*/15 * * * *", opts: { attempts: 1 } });

/** Cron 01:30 — đối soát heatmap của mọi bảng vừa có thay đổi trong 48 giờ (phủ cả ngày hôm qua). */
registerJob("cron", "activity.reconcile", async () => {
  const boards = await getContributionContainer().refresh.reconcileRecent();
  logger.info("[activity.reconcile] xong", { boards });
});
defineCron({ schedulerId: "activity.reconcile", queue: "cron", jobName: "activity.reconcile", pattern: "30 1 * * *", opts: { attempts: 1 } });

/** Cron 02:15 — dựng lại fact từ nguồn (`Task`/`TaskReview`) cho bảng có thay đổi trong 48 giờ. */
registerJob("cron", "contribution.reconcile", async () => {
  const result = await getContributionContainer().reconcile.run();
  logger.info("[contribution.reconcile] xong", { ...result });
});
defineCron({ schedulerId: "contribution.reconcile", queue: "cron", jobName: "contribution.reconcile", pattern: "15 2 * * *", opts: { attempts: 1 } });

/**
 * Cron 02:45 — múi giờ (`pm.timezone`) đã đổi: bảng có snapshot/ô heatmap còn theo múi giờ cũ → xếp tính lại + đánh dấu dựng lại heatmap (bảng đang được mở đã tự đúng khi xem).
 * Cron TĨNH (không tạo scheduler theo bảng — `syncCronSchedulers()` xoá scheduler động).
 */
registerJob("cron", "contribution.timezone-sync", async () => {
  const result = await getContributionContainer().timezoneSync.run();
  if (result.recompute > 0 || result.heatmap > 0) logger.info("[contribution.timezone-sync] đã đối chiếu múi giờ", { ...result });
});
defineCron({ schedulerId: "contribution.timezone-sync", queue: "cron", jobName: "contribution.timezone-sync", pattern: "45 2 * * *", opts: { attempts: 1 } });

/** Cron 03:30 — bản xuất `READY` quá hạn lưu (30 ngày) → `EXPIRED`, gỡ `AssetLink` (job dọn asset p0-05 xoá tệp sau ân hạn). */
registerJob("cron", "contribution-export.cleanup", async () => {
  const expired = await getContributionContainer().exportJobs.expireDue();
  if (expired > 0) logger.info("[contribution-export.cleanup] đã hết hạn", { expired });
});
defineCron({ schedulerId: "contribution-export.cleanup", queue: "cron", jobName: "contribution-export.cleanup", pattern: "30 3 * * *", opts: { attempts: 1 } });
