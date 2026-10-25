import { ROOM } from "./socket.rooms";
import { resolveTransport } from "./socket.transport";
import { logger } from "../logger";

/**
 * Ngắt kết nối MỌI socket đang mở của 1 user — dùng khi phiên bị vô hiệu
 * (đổi mật khẩu, khoá tài khoản, ...) để client buộc phải xác thực lại thay
 * vì tiếp tục dùng kết nối realtime cũ. Với Redis Adapter, lệnh này phát
 * broadcast sang MỌI instance server, không chỉ instance đang xử lý request.
 *
 * Chạy được ở CẢ API lẫn worker (job `realtime.disconnect-user`, cron ẩn danh hoá): worker không có `Server` nên lệnh đi qua cầu nối
 * Redis (`socket.bridge.ts`) và mọi instance API tự ngắt socket cục bộ của user đó.
 *
 * An toàn gọi khi chưa có đường phát nào (test, script, trước `initSocketServer()`) — `resolveTransport()` ném lỗi thì chỉ log cảnh báo,
 * không chặn luồng nghiệp vụ gọi nó.
 */
export function disconnectUserSockets(userId: string, reason: string): void {
  try {
    void resolveTransport().broadcaster.in(ROOM.user(userId)).disconnectSockets(true);
    logger.info(`[Socket] Ngắt kết nối mọi socket của user ${userId} — lý do: ${reason}`);
  } catch (err) {
    logger.warn(`[Socket] Không thể ngắt kết nối socket cho user ${userId}:`, err);
  }
}
