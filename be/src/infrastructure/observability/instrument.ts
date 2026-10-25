/**
 * Điểm khởi động quan sát (p0-11) — ⛔ PHẢI là import ĐẦU TIÊN của `server.ts` và `worker.ts`.
 *
 * Vì sao: Sentry (OpenTelemetry) tự đo http/express bằng cách móc vào `require` — chỉ móc được các module nạp SAU khi `Sentry.init()` chạy. Đặt import này sau
 * `express`/`http` thì lỗi vẫn được báo nhưng mất số liệu tracing. Thiếu `SENTRY_DSN` thì file này không làm gì (xem `initSentry`).
 */
import "dotenv/config";
import { initSentry } from "./sentry";

initSentry();
