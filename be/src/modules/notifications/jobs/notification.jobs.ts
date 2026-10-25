import { registerJob } from "../../../infrastructure/queue";
import { getDeliveryPolicy } from "../services/notification-wiring";

/**
 * `deliver.recipient` (queue `notifications`) — 1 job / 1 người nhận, đẩy từ
 * outbox bởi `notify()` (be.md §5.3/§5.4). Toàn bộ nghiệp vụ (quyền, inbox
 * socket, preference/DND, đang xem scope, enqueue push) nằm ở `DeliveryPolicy`
 * (lắp ở `notification-wiring.ts`) — job chỉ giải payload rồi gọi thẳng.
 */
registerJob("notifications", "deliver.recipient", async (job) => {
  const { notificationId, recipientId } = job.data as { notificationId: string; recipientId: string };
  await getDeliveryPolicy().deliverRecipient(notificationId, recipientId);
});
