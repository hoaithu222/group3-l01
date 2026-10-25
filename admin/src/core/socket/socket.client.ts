import { io, type Socket } from 'socket.io-client';

import { getAccessToken } from '@/core/api/session';
import { appConfig } from '@/core/config';
import { getOrCreateDeviceId } from '@/shared/utils/browser';

import { SocketEvent } from './socket.events';

/**
 * Client Socket.IO dùng chung toàn app — MỘT instance, không tạo lại theo
 * component. `autoConnect: false` vì vòng đời nối/ngắt do trạng thái đăng
 * nhập quyết định (xem `@/app/providers/SocketProvider`), không phải do
 * component nào mount trước.
 *
 * `auth` là HÀM (không phải object tĩnh) — socket.io gọi lại nó ở MỌI lần
 * (re)connect, nên token luôn là token MỚI NHẤT trong bộ nhớ, kể cả sau một
 * lượt refresh xoay vòng.
 *
 * `platform`/`deviceId` (p0-03): BE đọc qua `verifyAccessContext` cho registry
 * kết nối đa thiết bị (`conn:{userId}` — xem README p0-03 §4). `platform` cố ý
 * khai cứng `'WEB'` (BE cũng tự mặc định vậy khi thiếu — admin chỉ chạy trên
 * trình duyệt, không cần suy luận). `deviceId` bền qua các lần tải trang nhờ
 * `getOrCreateDeviceId()` (localStorage `device.id`, UUID) — KHÔNG phải định
 * danh bảo mật, chỉ để phân biệt các tab/trình duyệt của cùng một người vận
 * hành trên bảng đếm kết nối.
 *
 * ⛔ Xử lý `connect_error`/`session:expiring` KHÔNG nằm ở đây — xem
 * `socket.auth-sync.ts` (tách riêng để tránh import vòng với `socket.ack.ts`).
 */
export const socket: Socket = io('/', {
  path: appConfig.socketPath,
  autoConnect: false,
  transports: ['websocket', 'polling'],
  auth: (cb) => cb({ token: getAccessToken(), platform: 'WEB', deviceId: getOrCreateDeviceId() }),
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10_000,
});

/** Nối socket — bỏ qua nếu đã nối hoặc chưa có token (chưa đăng nhập). */
export function connectSocket(): void {
  if (!socket.connected && getAccessToken()) socket.connect();
}

/** Ngắt socket — gọi khi đăng xuất hoặc phiên hết hạn. */
export function disconnectSocket(): void {
  if (socket.connected) socket.disconnect();
}

/**
 * Xin vào một phòng theo `{ kind, id }` (vd `{ kind: 'ws', id: 'w1' }`) — BE tự
 * ghép tên phòng, client không được gửi tên tự do (xem `config-be.md §7`).
 * Trả `false` khi ack không tới hoặc BE từ chối (thiếu quyền truy cập phòng).
 */
export async function joinRoom(kind: string, id: string): Promise<boolean> {
  return new Promise((resolve) => {
    socket.emit(SocketEvent.JOIN_ROOM, { kind, id }, (ack?: { ok: boolean }) =>
      resolve(Boolean(ack?.ok)),
    );
  });
}

/** Rời một phòng đã `joinRoom`. */
export function leaveRoom(kind: string, id: string): void {
  socket.emit(SocketEvent.LEAVE_ROOM, { kind, id });
}
