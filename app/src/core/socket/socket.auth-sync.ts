import { getAccessToken, purgeSession } from '@/core/api/session';
import { useAuthStore } from '@/shell/store/slices/auth';

import { socket } from './socket.client';
import { SOCKET_AUTH_LOGOUT_CODES, SocketEvent } from './socket.events';

/**
 * Đồng bộ trạng thái phiên GIỮA REST và Socket.IO.
 *
 * ⛔ File RIÊNG, không gộp vào `socket.client.ts` — vì sao: `use-room-subscription`
 * và các module khác cần `emitWithAck` (`socket.ack.ts`), mà `socket.ack.ts` cần
 * `socket` từ `socket.client.ts`. Nếu `socket.client.ts` NHẬP NGƯỢC lại bất cứ
 * thứ gì từ một file cần `socket.ack.ts`, ta có IMPORT VÒNG (`import/no-cycle`)
 * — vòng đó hiện ra lúc CHẠY dưới dạng `undefined is not a function`, không phải
 * lỗi biên dịch dễ thấy. Vì vậy các nhánh đăng ký dưới đây (cần đọc/ghi qua auth
 * store, có thể cần ack) nằm tách biệt hẳn, chỉ nhập MỘT chiều từ `socket.client.ts`.
 *
 * Nạp module này (side-effect, giống `connect_error` ở `socket.client.ts`) qua
 * `core/socket/index.ts` — ba việc đăng ký ngay lúc đó:
 *
 *  1. `connect_error` với `data.code` ∈ `SOCKET_AUTH_LOGOUT_CODES` — BE đã xác
 *     nhận phiên CHẾT THẬT ngay ở bước handshake (khác lỗi mạng) → dọn phiên
 *     ngay, KHÔNG thử refresh (sẽ ăn đúng lỗi này lần nữa). Guard điều hướng tự
 *     đẩy về đăng nhập theo `status` đổi thành `'anonymous'` (`AppProviders`).
 *  2. `session:expiring` (BE báo còn ~60s hết hạn) → đẩy token HIỆN TẠI qua
 *     `auth:refresh` để giữ ĐÚNG một kết nối sống, không phải disconnect/
 *     reconnect. Ack `RT_401` (refresh token cũng đã chết) ⇒ ngắt rồi nối lại —
 *     handshake mới sẽ tự chạy lại toàn bộ cờ đăng nhập.
 *  3. Access token trong store ĐỔI (một request REST khác vừa âm thầm làm mới)
 *     trong lúc socket đang nối sẵn → đẩy `auth:refresh` ngay, không chờ tới
 *     lượt `session:expiring` kế tiếp mới đồng bộ.
 */

interface AuthRefreshAck {
  code?: string;
  ok: boolean;
}

function pushAuthRefresh(token: string): void {
  socket.emit(SocketEvent.AUTH_REFRESH, { token }, (ack: AuthRefreshAck) => {
    if (ack?.code !== 'RT_401') return;
    socket.disconnect();
    socket.connect();
  });
}

socket.on('connect_error', async (err: Error) => {
  const code = (err as { data?: { code?: string } }).data?.code;
  if (code && SOCKET_AUTH_LOGOUT_CODES.has(code)) await purgeSession();
});

socket.on(SocketEvent.SESSION_EXPIRING, () => {
  const token = getAccessToken();
  if (token) pushAuthRefresh(token);
});

let previousToken = getAccessToken();
useAuthStore.subscribe((state) => {
  const { token } = state;
  if (token && token !== previousToken && socket.connected) pushAuthRefresh(token);
  previousToken = token;
});
