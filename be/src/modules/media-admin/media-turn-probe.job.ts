import { env } from "../../core/config";
import { defineCron, registerJob } from "../../infrastructure/queue";
import { logger } from "../../infrastructure/logger";
import { createLogThrottle } from "../../infrastructure/logger/log-throttle";
import { runTurnProbe, type TurnProbeResult } from "../../infrastructure/media/turn-probe";
import { turnProbeCertExpirySeconds, turnProbeDurationSeconds, turnProbeLastRunTimestampSeconds, turnProbeUp } from "../../infrastructure/metrics/turn.metrics";
import { redis } from "../../infrastructure/redis";

/** Khoá Redis mà `GET /admin/media/health` đọc (`admin-media-ops.container.ts`) — `{ at, ok, error? , udp, tls }`. */
export const TURN_PROBE_KEY = "media:turn-probe:last";
/** Gấp 6 lần chu kỳ cron (5 phút): mất vài lượt liên tiếp mới thành "UNKNOWN"; health tự coi > `turnProbeStaleMinutes` là DEGRADED. */
export const TURN_PROBE_TTL_SECONDS = 1800;

const FAILURE_LOG_INTERVAL_MS = 15 * 60_000;
const failureLog = createLogThrottle(FAILURE_LOG_INTERVAL_MS);

function publishMetrics(result: TurnProbeResult, nowSeconds: number): void {
  turnProbeLastRunTimestampSeconds.set(nowSeconds);
  for (const [transport, step] of [["udp", result.udp], ["tls", result.tls]] as const) {
    turnProbeUp.set({ transport }, step.ok ? 1 : 0);
    if (step.ok && step.latencyMs !== undefined) turnProbeDurationSeconds.set({ transport }, step.latencyMs / 1000);
  }
  if (result.tls.daysToExpiry !== undefined) turnProbeCertExpirySeconds.set(result.tls.daysToExpiry * 86_400);
}

/**
 * `media.turn-probe` (queue `cron`, mỗi 5 phút — be.md §7 p0-08): thăm dò TURN UDP + TLS rồi ghi Redis `media:turn-probe:last` (admin `turn`) và gauge `turn_probe_*` (cảnh báo).
 * Thiếu `TURN_PROBE_HOST` ⇒ KHÔNG làm gì (không ghi khoá ⇒ admin `UNKNOWN`). Không bao giờ ném: lỗi thăm dò là DỮ LIỆU (`ok:false`), không phải lỗi job; ghi log nén 15 phút/lần.
 */
export async function runTurnProbeJob(): Promise<void> {
  const host = env.TURN_PROBE_HOST;
  if (!host) return;
  let result: TurnProbeResult;
  try {
    result = await runTurnProbe({ host, tlsPort: env.TURN_PROBE_TLS_PORT, udpPort: env.TURN_PROBE_UDP_PORT });
  } catch (err) {
    result = {
      at: new Date().toISOString(),
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      udp: { ok: false },
      tls: { ok: false },
    };
  }
  publishMetrics(result, Math.floor(Date.now() / 1000));
  try {
    await redis.set(TURN_PROBE_KEY, result, TURN_PROBE_TTL_SECONDS);
  } catch (err) {
    logger.warn("[media.turn-probe] Không ghi được Redis", { error: err instanceof Error ? err.message : String(err) });
  }
  if (result.ok) {
    if (failureLog.clear("probe")) logger.info("[media.turn-probe] TURN đã hoạt động trở lại");
    return;
  }
  const gate = failureLog.tryAcquire("probe");
  if (gate) logger.warn("[media.turn-probe] Thăm dò TURN thất bại", { error: result.error, ...(gate.suppressed > 0 && { suppressed: gate.suppressed }) });
}

registerJob("cron", "media.turn-probe", runTurnProbeJob);

defineCron({
  schedulerId: "media.turn-probe",
  queue: "cron",
  jobName: "media.turn-probe",
  pattern: "*/5 * * * *",
  opts: { attempts: 1 },
});
