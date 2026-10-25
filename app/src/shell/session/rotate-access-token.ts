import { setAccessToken } from '@/core/api/session';
import { connectSocket, disconnectSocket } from '@/core/socket';

/**
 * Ghi access token MỚI mà BE cấp giữa phiên (sau đổi mật khẩu) và nối lại socket bằng token đó.
 *
 * ── Vì sao không chỉ `setAccessToken` ────────────────────────────────────────
 * Đổi mật khẩu khiến BE ngắt MỌI socket của người dùng (`disconnectUserSockets`, `io server
 * disconnect`) — kể cả socket của máy vừa đổi. Socket.IO KHÔNG tự nối lại sau lệnh ngắt từ phía
 * máy chủ, và `connectSocket()` chỉ chạy lúc app trở lại nền trước / đăng nhập, nên thiếu bước này
 * chat, cuộc gọi và huy hiệu chưa đọc của máy này im lặng chết tới lần mở app kế tiếp.
 *
 * `disconnectSocket()` rồi `connectSocket()` (cả hai đều bỏ qua êm khi không cần) thay vì chỉ
 * `connectSocket()`: lệnh ngắt của máy chủ có thể tới SAU phản hồi HTTP, lúc `socket.connected`
 * còn `true` — nối lại chỉ khi "đã ngắt" thì đúng ca đó bị bỏ lỡ.
 */
export function applyRotatedAccessToken(accessToken: string): void {
  setAccessToken(accessToken);
  disconnectSocket();
  connectSocket();
}
