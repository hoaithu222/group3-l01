import { registerJob } from "../../infrastructure/queue";
import { emitToUsers } from "../../infrastructure/socket/socket.emit";
import { SocketEvent } from "../../infrastructure/socket/socket.events";
import { setNotificationBlockFilter } from "../notifications/public";
import { registerPresenceHiddenResolver } from "../presence/presence.service";
import { getBlockPort } from "./public";

// File này nằm trong `registerAllJobs()` → nạp ở CẢ API lẫn worker riêng (PROCESS_ROLE=worker không import `router.ts`),
// nên đặt các phép nối `BlockPort` cần cho cả hai tiến trình ở đây:
// - p1-07 pipeline thông báo tin nhắn (mention/thread/push — NT-14, BLOCK-03) lọc người ĐÃ CHẶN tác giả qua `BlockPort`
//   (cache Redis) thay vì đọc `UserBlock` mỗi lượt.
// - p0-03 presence (BLOCK-06): không phát/không trả presence giữa cặp đã chặn (cả hai hướng), kể cả lượt OFFLINE do job reap.
setNotificationBlockFilter(getBlockPort());
registerPresenceHiddenResolver((userId) => getBlockPort().hiddenBetween(userId));

interface BlockEventPayload {
  event: "blocked" | "unblocked";
  blockerId: string;
  blockedId: string;
}

/**
 * `block.events` (queue `notifications`) — outbox `user.blocked`/`user.unblocked` → socket
 * `block:updated` tới `user:{blockerId}` (đa thiết bị, BLOCK-05 ≤ 2 s). CHỈ gửi cho NGƯỜI CHẶN —
 * người bị chặn không nhận gì (README p1-08 §2 "Thông điệp khi bị chặn: trung tính"). Emit lặp
 * (retry at-least-once) vô hại: client áp dụng theo tập id (`added`/`removed`), không cộng dồn.
 */
registerJob("notifications", "block.events", (job) => {
  const payload = job.data as BlockEventPayload;
  emitToUsers([payload.blockerId], SocketEvent.BLOCK_UPDATED, {
    ...(payload.event === "blocked" ? { added: payload.blockedId } : { removed: payload.blockedId }),
  });
  return Promise.resolve();
});
