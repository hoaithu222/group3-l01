import { logger } from "../../../infrastructure/logger";
import { defineCron, registerJob } from "../../../infrastructure/queue";
import { registerTaskEventSink } from "../events/task-event-sinks";
import { TASK_EVENTS } from "../events/project-events";
import { getProjectsContainer } from "../projects.container";
import { REVIEW_MEMBERSHIP_JOB, REVIEW_MEMBERSHIP_QUEUE, type ReviewMembershipJob } from "../services/review/review-events";
import { registerReviewRevokeListener } from "./review-revoke-listener";

// `revokeScope` cũng chạy trong job của worker (khách hết hạn…) — đăng ký listener ở CẢ hai tiến trình.
registerReviewRevokeListener();

/**
 * Sink `task.events` (p4-05): người chấm thành người làm (`task.assigned`) ⇒ giao lại; thẻ xoá ⇒ huỷ lượt mở; thẻ tạo/khôi phục thẳng vào cột REVIEW ⇒ mở lượt
 * (những đường không đi qua `move` nên `TaskMoveEffect` không chạy). Sink idempotent theo trạng thái hiện tại của thẻ/lượt.
 */
registerTaskEventSink("p4-05.review", async (payload) => {
  const reconcile = getProjectsContainer().review.reconcile;
  switch (payload.event) {
    case TASK_EVENTS.ASSIGNED:
      await reconcile.onTaskAssigned(payload.taskId);
      return;
    case TASK_EVENTS.DELETED:
      await reconcile.onTaskDeleted(payload.taskId, payload.boardId);
      return;
    case TASK_EVENTS.CREATED:
    case TASK_EVENTS.RESTORED:
      await reconcile.onTaskEntered(payload.taskId);
      return;
    default:
      return;
  }
});

/** `reports/review.membership` (từ listener `revokeScope`): giao lại review PENDING của người không còn đủ điều kiện trong workspace. */
registerJob(REVIEW_MEMBERSHIP_QUEUE, REVIEW_MEMBERSHIP_JOB, async (job) => {
  const data = job.data as Partial<ReviewMembershipJob> | null;
  if (!data?.workspaceId || !Array.isArray(data.userIds) || data.userIds.length === 0) {
    logger.warn("[review.membership] payload không hợp lệ, bỏ qua", { id: job.id });
    return;
  }
  const replaced = await getProjectsContainer().review.reconcile.reassignForUsers(data.workspaceId, data.userIds);
  if (replaced > 0) logger.info("[review.membership] đã giao lại người chấm", { workspaceId: data.workspaceId, replaced });
});

/**
 * Cron TĨNH mỗi 15 phút — quét bù: review PENDING của người đã rời/bị ẩn danh hoá/trở thành người làm, lượt mở mà thẻ đã xoá/không còn ở REVIEW/bảng đã tắt
 * chấm chéo. (`UserAnonymizer` không có điểm nối; sự kiện có thể mất.) Không tạo scheduler theo thực thể — `syncCronSchedulers()` xoá scheduler động.
 */
registerJob("cron", "review.reconcile", async () => {
  const result = await getProjectsContainer().review.reconcile.sweep();
  if (result.replaced > 0 || result.cancelledRounds > 0) logger.info("[review.reconcile] xong", { ...result });
});
defineCron({ schedulerId: "review.reconcile", queue: "cron", jobName: "review.reconcile", pattern: "*/15 * * * *", opts: { attempts: 1 } });
