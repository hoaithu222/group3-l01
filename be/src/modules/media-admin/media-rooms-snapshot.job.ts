import { defineCron, registerJob } from "../../infrastructure/queue";
import { logger } from "../../infrastructure/logger";
import { createLogThrottle } from "../../infrastructure/logger/log-throttle";
import { captureRoomsSnapshot, getLiveKit, isMediaRequired } from "../../infrastructure/media";

/** LiveKit tắt/không tới được thì cron lỗi mỗi 30 s — cảnh báo chỉ ghi một lần / 5 phút, hồi phục thì báo một lần. */
const FAILURE_LOG_INTERVAL_MS = 5 * 60_000;
const FAILURE_KEY = "capture";
const failureLog = createLogThrottle(FAILURE_LOG_INTERVAL_MS);

/**
 * `media.rooms-snapshot` (queue `cron`, mỗi 30 s, CHỈ khi voice/meeting bật — be.md §7): ghi gauge
 * `livekit_rooms_active` + Redis `media:rooms:active` (TTL 90 s) cho `/metrics` của tiến trình API và trang admin.
 * Lỗi LiveKit chỉ log (không retry — lượt sau 30 s tự thử lại), nén theo `failureLog`.
 */
registerJob("cron", "media.rooms-snapshot", async () => {
  const server = getLiveKit();
  if (!server.isConfigured() || !(await isMediaRequired())) return;
  try {
    await captureRoomsSnapshot(server);
    if (failureLog.clear(FAILURE_KEY)) logger.info("[media.rooms-snapshot] Đã lấy lại được danh sách phòng");
  } catch (err) {
    const gate = failureLog.tryAcquire(FAILURE_KEY);
    if (gate) {
      logger.warn("[media.rooms-snapshot] Không lấy được danh sách phòng", {
        error: err instanceof Error ? err.message : String(err),
        ...(gate.suppressed > 0 && { suppressed: gate.suppressed }),
      });
    }
  }
});

defineCron({
  schedulerId: "media.rooms-snapshot",
  queue: "cron",
  jobName: "media.rooms-snapshot",
  pattern: "*/30 * * * * *",
  opts: { attempts: 1 },
});
