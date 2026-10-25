/**
 * @file socket.bridge.ts
 * @description Cầu nối "worker → socket" dùng chung (p0-03 — gỡ BLOCKER "worker không có `getIO()`").
 *
 * Tiến trình worker (`worker.ts`, `PROCESS_ROLE=worker`) KHÔNG dựng Socket.IO `Server` nên không thể `io.to(room).emit(...)`.
 * Mọi job/consumer chạy ở đó (`call:*`, `message:*`, `permission:revoked`, `config:updated`, `presence:updated`, đá khỏi room, ngắt socket
 * khi đổi mật khẩu…) phải đi qua cầu nối này. Cách hoạt động:
 *
 *  - Dùng `@socket.io/redis-emitter` (cùng họ với `@socket.io/redis-adapter` mà tiến trình API đã gắn ở `socket.server.ts`): emitter ghi gói
 *    theo ĐÚNG giao thức của adapter lên Redis ⇒ MỖI instance API nhận đúng MỘT lần và chỉ phát cho socket CỤC BỘ của nó ⇒ client KHÔNG nhận
 *    trùng dù có N instance API (cùng cơ chế mà `io.emit` giữa các instance API vẫn dùng). Không tự dựng pub/sub, không cần khoá `SET NX`.
 *  - Tiến trình có `getIO()` (API/`all`) vẫn phát TRỰC TIẾP như cũ — cầu nối chỉ được chọn khi KHÔNG có `Server` (xem `socket.transport.ts`).
 *  - Kích hoạt TƯỜNG MINH bằng `initSocketBridge()` ở `worker.ts` (không tự bật khi thiếu `getIO()`): script/test không có Redis không bị mở
 *    kết nối ngầm, và lời gọi `emit*` ở nơi CHƯA khởi tạo cầu nối vẫn ném lỗi cũ ("Socket.IO chưa được khởi tạo") như trước.
 *
 * Bảo đảm (bài học `outboxSignal`: publish trên client chờ-vô-hạn khi Redis mất từng treo request) — cài đặt ở `socket.bridge.client.ts`:
 *  - KHÔNG BAO GIỜ ném lỗi, KHÔNG BAO GIỜ treo lời gọi `emit*` (đồng bộ, "bắn rồi quên") — lỗi chỉ được đếm + log (giới hạn tần suất).
 *  - Dùng client `redis` (node-redis) dùng chung, chỉ phát khi `isReady` (đang mất kết nối ⇒ BỎ sự kiện chứ không xếp hàng vô hạn trong bộ nhớ,
 *    và không phát lại sự kiện cũ khi Redis sống lại); mỗi lệnh có trần `PUBLISH_TIMEOUT_MS` (1 s); số lệnh đang bay có trần `MAX_INFLIGHT`.
 *  - Ngữ nghĩa là "tối đa một lần" như chính Socket.IO: sự kiện phải BỀN đi qua outbox + consumer (job retry), cầu nối chỉ là đường phát.
 *  - MỘT CHIỀU (ghi): không có `fetchSockets`/đọc trạng thái phòng ở worker — cần biết "ai đang xem" thì đọc khoá Redis (`socket.viewing.ts`).
 *  - Payload đi qua `JSON.parse(JSON.stringify(...))` để có ĐÚNG ngữ nghĩa JSON như đường trực tiếp (Date → ISO, `toJSON`, bỏ `undefined`).
 *
 * File LÁ có chủ đích (chỉ import config/logger/redis + hai file cầu nối, KHÔNG import `socket.server`): `worker.ts` nạp nó sớm mà không đổi thứ
 * tự nạp module khác.
 */
import { env } from "../../core/config";
import { logger } from "../logger";
import { redis } from "../redis";
import { SocketBridgeClient } from "./socket.bridge.client";
import {
  CLOSE_TIMEOUT_MS,
  MAX_INFLIGHT,
  PUBLISH_TIMEOUT_MS,
  SOCKET_IO_REDIS_KEY,
  type BridgePublisher,
  type SocketBridge,
  type SocketBridgeOptions,
} from "./socket.bridge.types";

// Hằng số + kiểu công khai của cầu nối — nơi khác (`socket.server.ts`, `socket.transport.ts`, listener, test) chỉ import từ file này.
export { BRIDGE_RECHECK_EVENT, CLOSE_TIMEOUT_MS, MAX_INFLIGHT, PUBLISH_TIMEOUT_MS, SOCKET_IO_REDIS_KEY } from "./socket.bridge.types";
export type {
  BridgePublisher,
  BridgeRecheckCommand,
  BroadcastOp,
  SocketBridge,
  SocketBridgeOptions,
  SocketBridgeStats,
} from "./socket.bridge.types";

const defaultPublisher: BridgePublisher = {
  isReady: () => redis.getClient()?.isReady === true,
  publish: (channel, message) => {
    const client = redis.getClient();
    if (!client?.isReady) return Promise.reject(new Error("Redis chưa sẵn sàng"));
    return client.publish(channel, message);
  },
};

let bridge: SocketBridge | null = null;

/**
 * Bật cầu nối cho tiến trình HIỆN TẠI — chỉ `worker.ts` gọi (tiến trình không có `Server`). Đồng bộ, KHÔNG cần Redis sẵn sàng lúc gọi (mỗi lần
 * phát mới kiểm `isReady`), gọi lại là no-op. Nhớ `await closeSocketBridge()` trong graceful shutdown, SAU `closeWorkers()`.
 */
export function initSocketBridge(options: SocketBridgeOptions = {}): SocketBridge {
  if (bridge) return bridge;
  if (env.SOCKET_ADAPTER !== "redis") {
    logger.warn(
      "[socket.bridge] SOCKET_ADAPTER != redis — instance API không lắng kênh Redis nên sự kiện realtime phát từ worker sẽ không tới client (dev: chạy PROCESS_ROLE=all)"
    );
  }
  bridge = new SocketBridgeClient(
    options.publisher ?? defaultPublisher,
    options.key ?? SOCKET_IO_REDIS_KEY,
    options.timeoutMs ?? PUBLISH_TIMEOUT_MS,
    options.maxInflight ?? MAX_INFLIGHT,
    options.closeTimeoutMs ?? CLOSE_TIMEOUT_MS
  );
  logger.info("[socket.bridge] Đã bật cầu nối worker → socket (Redis emitter)");
  return bridge;
}

/** `null` = tiến trình này KHÔNG chạy ở chế độ worker (API/`all`/test): `socket.transport.ts` bỏ qua cầu nối. */
export function getSocketBridge(): SocketBridge | null {
  return bridge;
}

/** Tắt gọn — an toàn khi chưa `init`. Sau khi đóng, lệnh phát muộn bị BỎ êm (không ném) thay vì rơi về lỗi "chưa khởi tạo". */
export async function closeSocketBridge(): Promise<void> {
  await bridge?.close();
}

/** Chỉ dùng trong test: thay/gỡ cầu nối (không đóng cầu nối cũ). */
export function setSocketBridgeForTests(next: SocketBridge | null): void {
  bridge = next;
}
