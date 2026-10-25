import { withTransaction } from "../../../infrastructure/database";
import { notify } from "../../notifications/public";
import { getProjectsContainer } from "../projects.container";
import { ReviewNotificationHandler } from "../services/review/review-notification.handler";
import type { NotifyFn } from "../services/task-notification.handler";

/** `notify()` cần transaction do NƠI GỌI mở (ghi Notification + Recipient + Outbox nguyên tử) — p0-06 §5.3. */
const notifyInTx: NotifyFn = async (input) => {
  await withTransaction((tx) => notify(tx, input));
};

let handler: ReviewNotificationHandler | null = null;

/**
 * Composition root của các job chấm chéo (p4-05): tiến trình worker không import `projects.routes.ts` nên dùng singleton container lười (cùng mẫu
 * `task-detail-wiring.ts`). File job chỉ gọi các hàm ở đây.
 */
export function getReviewNotificationHandler(): ReviewNotificationHandler {
  if (!handler) {
    const c = getProjectsContainer();
    handler = new ReviewNotificationHandler({
      rounds: c.review.deps.rounds,
      reviews: c.review.deps.reviews,
      tasks: c.tasks,
      directory: c.directory,
      notify: notifyInTx,
      publisher: c.review.publisher,
      reminders: c.review.reminders,
      defaults: c.review.deps.defaults,
    });
  }
  return handler;
}
