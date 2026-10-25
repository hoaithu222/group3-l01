import { Gauge } from "prom-client";
import { registry } from "./metrics.client";

/**
 * Metric vận hành media (p2-07 be.md §9). Khai ở file riêng như `call.metrics.ts`/`recording.metrics.ts`; KHÔNG gắn nhãn phòng/người dùng.
 * Cùng vòng đời với `livekit_rooms_active`: cron `media.rooms-snapshot` (worker) ghi ảnh chụp Redis, `/metrics` của API nạp lại lúc scrape.
 */

/** Tổng số người đang ở trong các phòng LiveKit (Σ `numParticipants`) — dashboard `livekit.json`, cảnh báo P1. */
export const livekitParticipantsActive = new Gauge({
  name: "livekit_participants_active",
  help: "Số người đang ở trong các phòng media LiveKit",
  registers: [registry],
});
