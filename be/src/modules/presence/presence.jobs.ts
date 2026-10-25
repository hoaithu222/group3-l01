import { registerJob, defineCron } from "../../infrastructure/queue";
import { logger } from "../../infrastructure/logger";
import { reap } from "./presence.service";

/**
 * `presence.reap` (queue `cron`, be.md §7) — dọn/tính lại trạng thái presence
 * đã hết lease mà không có trigger nào khác đưa về OFFLINE (mất mạng, app bị
 * kill — không có `disconnect` sạch để tự phát ngay, xem `presence.service.ts`).
 *
 * ⚠️ Lịch mong muốn theo be.md §7 là "mỗi 1 phút" nhưng `CronDefinition`
 * (p0-04, KHÔNG được đụng trong nhiệm vụ này) chỉ nhận `pattern` cron 5
 * trường, không có `everyMs`. Theo ĐÚNG tiền lệ `outbox.relay` (p0-04) —
 * dùng `pattern: "* * * * *"` (mỗi phút) làm giá trị gần đúng.
 */
registerJob("cron", "presence.reap", async () => {
  const recomputed = await reap();
  logger.info("[presence.reap] Đã quét lại presence:state:*", { recomputed });
});

defineCron({
  schedulerId: "presence.reap",
  queue: "cron",
  jobName: "presence.reap",
  pattern: "* * * * *",
  opts: { attempts: 1 },
});
