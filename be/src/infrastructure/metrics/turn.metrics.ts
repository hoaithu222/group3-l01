import { Gauge } from "prom-client";
import { registry } from "./metrics.client";

/**
 * Metric thăm dò TURN (p0-08/p0-11) — do cron `media.turn-probe` cập nhật TRONG TIẾN TRÌNH WORKER nên chỉ hiện ở `worker:9464/metrics` (không phải `/metrics` của API).
 * Nhãn `transport` chỉ nhận `udp` | `tls`. Cảnh báo (`deploy/observability/alerts.yml`): `TurnProbeDown`, `TurnProbeStale`, `TurnCertExpiringSoon`.
 */
export const turnProbeUp = new Gauge({
  name: "turn_probe_up",
  help: "1 nếu lần thăm dò TURN gần nhất thành công, 0 nếu thất bại — theo đường (udp|tls)",
  labelNames: ["transport"] as const,
  registers: [registry],
});

export const turnProbeDurationSeconds = new Gauge({
  name: "turn_probe_duration_seconds",
  help: "Thời gian lần thăm dò TURN gần nhất (giây) — theo đường (udp|tls); chỉ đặt khi thành công",
  labelNames: ["transport"] as const,
  registers: [registry],
});

export const turnProbeCertExpirySeconds = new Gauge({
  name: "turn_probe_cert_expiry_seconds",
  help: "Số giây còn lại tới khi chứng chỉ TLS của TURN hết hạn (âm = đã hết hạn)",
  registers: [registry],
});

export const turnProbeLastRunTimestampSeconds = new Gauge({
  name: "turn_probe_last_run_timestamp_seconds",
  help: "Thời điểm (unix, giây) cron thăm dò TURN chạy lần gần nhất — phát hiện cron ngừng chạy",
  registers: [registry],
});
