/**
 * Trạng thái "đang tắt để cập nhật" (p0-11 be.md §5.2). `server.ts` gọi `startDrain()` ngay khi nhận SIGTERM; `GET /api/health` từ đó trả 503 `draining`
 * (Docker/LB/nginx thấy replica sắp tắt) còn `GET /api/health/live` vẫn 200 (tiến trình còn sống, KHÔNG restart). Cờ chỉ có một chiều — không có `endDrain`:
 * tiến trình đã nhận SIGTERM sẽ thoát.
 */
let draining = false;

export function beginDrain(): void {
  draining = true;
}

export function isDraining(): boolean {
  return draining;
}

/** Phần tối thiểu của Socket.IO `Server` mà drain cần — khai cấu trúc để test không cần dựng server thật. */
export interface DrainableSocketServer {
  local: { disconnectSockets(close?: boolean): void };
}

/**
 * Bắt đầu drain: bật cờ (health 503 `draining`) rồi, sau `socketDelayMs` (cho LB/Docker kịp thấy 503), ngắt mọi socket CỦA REPLICA NÀY (`io.local` — không đụng replica khác
 * qua Redis adapter) để client (đã có backoff) tự kết nối lại sang replica còn sống. Vì sao phải ngắt: WebSocket giữ kết nối mở nên `httpServer.close()` sẽ không bao giờ gọi
 * callback nếu còn socket (rồi bị force-exit mã 1 sau grace). Trả timer để nơi gọi/test huỷ được. `io = null` (worker, test) chỉ bật cờ.
 */
export function startDrain(io: DrainableSocketServer | null, socketDelayMs: number): NodeJS.Timeout | null {
  beginDrain();
  if (!io) return null;
  return setTimeout(() => io.local.disconnectSockets(true), socketDelayMs);
}

/** CHỈ dùng trong test. */
export function resetDrainForTests(): void {
  draining = false;
}
