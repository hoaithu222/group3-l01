import { registerJob } from "../worker";
import { defineCron } from "../cron.registry";
import { drainOutboxBatch } from "./outbox.relay";

/**
 * `outbox.relay` (queue `cron`) — lưới an toàn khi subscriber Pub/Sub của
 * process này "chết" (mất kết nối, chưa reconnect) mà chưa kịp bù bằng poll
 * nội bộ (`startOutboxRelay()`): BullMQ tự chạy lại theo lịch dù cơ chế relay
 * trong-process gặp sự cố. `attempts: 1` — bản thân `drainOutboxBatch()` đã tự
 * xử lý lỗi/backoff ở tầng `OutboxEvent`, không cần BullMQ retry job này.
 *
 * Lịch "mỗi 10 s" theo be.md §5.3 (`everyMs`, BullMQ `every`) — trước p0-04 nit `CronDefinition` chỉ có `pattern` nên phải tạm dùng `* * * * *`.
 * Độ trễ thực tế vẫn dưới giây nhờ Pub/Sub signal + `OUTBOX_POLL_MS` (mặc định 1s) trong `startOutboxRelay()`; cron này chỉ là lớp phòng thủ cuối
 * khi CẢ HAI cơ chế trên đều hỏng cùng lúc. `removeOnComplete: true`: mỗi 10 s một job — không giữ lịch sử thành công kẻo đẩy hết lịch sử của các cron
 * khác ra khỏi queue `cron` (mặc định giữ 1000 job/queue); lần chạy lỗi vẫn được giữ (`removeOnFail: 100`) để admin xem.
 */
registerJob("cron", "outbox.relay", async () => {
  await drainOutboxBatch();
});

defineCron({
  schedulerId: "outbox.relay",
  queue: "cron",
  jobName: "outbox.relay",
  everyMs: 10_000,
  opts: { attempts: 1, removeOnComplete: true, removeOnFail: 100 },
});
