/**
 * @file socket.auth-sync.ts
 * @description Đồng bộ trạng thái phiên GIỮA REST và Socket.IO (p0-03).
 *
 * ⛔ File RIÊNG với `socket.client.ts`, KHÔNG gộp lại — `emitWithAck`
 * (`socket.ack.ts`) cần đọc `socket` từ `socket.client.ts`; nếu
 * `socket.client.ts` NHẬP NGƯỢC lại bất cứ thứ gì cần `socket.ack.ts` ta có
 * IMPORT VÒNG (bắt được lúc CI chạy `npm run check:cycles` — `madge
 * --circular`), lộ ra lúc CHẠY dưới dạng `undefined is not a function`, không
 * phải lỗi biên dịch dễ thấy. Nạp module này qua `core/socket/index.ts`
 * (side-effect, giống `connect_error` gốc từng nằm ở `socket.client.ts`).
 *
 * Ba việc đăng ký ngay lúc import:
 *
 *  1. `connect_error` với `data.code` thuộc nhóm `AUTH_*`. Hai loại, KHÔNG được gộp:
 *     - Access token bắt tay không dùng được (`AUTH_002/003/004`) → cookie refresh có
 *       thể còn sống → `refreshSession()` RỒI nối lại. Chỉ khi refresh nói phiên chết
 *       (`unauthenticated`) mới dọn phiên; mạng/BE chập (`unavailable`) thì GIỮ phiên
 *       và hẹn nối lại — cùng nguyên tắc `unavailable ≠ unauthenticated` của REST.
 *       socket.io KHÔNG tự nối lại khi handshake bị middleware từ chối, nên phải tự gọi.
 *     - Phán quyết cuối của máy chủ (`AUTH_011/012` khoá / chờ xoá, `AUTH_010`…) →
 *       `purgeAuthSession()` ngay, không thử refresh. Guard điều hướng tự đẩy về đăng
 *       nhập theo `status` đổi thành `'anonymous'` (`SocketProvider` gọi
 *       `disconnectSocket()` + `resetRoomSubscriptions()` theo `status` đó).
 *  2. `session:expiring` (BE báo còn ~60s hết hạn) → `refreshSession()` (cookie
 *     HttpOnly, giống mọi refresh REST khác) rồi đẩy token MỚI qua
 *     `auth:refresh` — giữ ĐÚNG một kết nối sống, không disconnect/reconnect.
 *     Refresh thất bại (`unauthenticated`/`unavailable`) thì bỏ qua: BE sẽ tự
 *     đá socket khi access token thật sự hết hạn, lúc đó `disconnect` rồi nhánh 3 +
 *     nhánh 1 lo tiếp.
 *  3. `disconnect` do MÁY CHỦ chủ động ngắt (`io server disconnect`: khoá tài khoản,
 *     đổi mật khẩu, thu hồi phiên, token hết hạn…) — socket.io cũng KHÔNG tự nối lại
 *     ở trường hợp này, nên realtime chết im lặng. Nối lại để handshake phán: phiên
 *     còn thì sống tiếp, đã chết thì `connect_error` ở mục 1 dọn phiên.
 */
import { purgeAuthSession, refreshSession } from '@/core/api/session';

import { emitWithAck } from './socket.ack';
import { connectSocket, socket } from './socket.client';
import { isAuthLogoutCode, isRefreshableAuthCode, SocketEvent } from './socket.events';

/** Chờ bao lâu rồi nối lại khi máy chủ chưa trả lời lượt refresh. */
const RECONNECT_DELAY_MS = 5_000;

/**
 * Đã làm mới token và nối lại MỘT lần mà handshake vẫn bị từ chối bằng mã "token" —
 * lượt kế tiếp là phiên chết thật, không refresh nữa (chặn vòng refresh–nối–lỗi vô hạn,
 * mỗi vòng xoay một refresh token phía BE). Hạ cờ khi nối được.
 */
let refreshedForHandshake = false;

async function recoverHandshake(): Promise<void> {
  const outcome = await refreshSession();

  if (outcome.status === 'ok') {
    refreshedForHandshake = true;
    connectSocket();
    return;
  }
  if (outcome.status === 'unauthenticated') {
    purgeAuthSession(outcome.endReason ?? 'expired');
    return;
  }
  // `unavailable`: máy chủ chưa trả lời → giữ phiên, thử lại sau. Không đếm vào
  // `refreshedForHandshake` — chưa có token mới nào bị từ chối.
  setTimeout(connectSocket, RECONNECT_DELAY_MS);
}

socket.on('connect', () => {
  refreshedForHandshake = false;
});

socket.on('connect_error', (err: Error) => {
  const code = (err as { data?: { code?: string } }).data?.code;
  if (!isAuthLogoutCode(code)) return;

  if (isRefreshableAuthCode(code) && !refreshedForHandshake) {
    void recoverHandshake();
    return;
  }
  // Phán quyết cuối: khoá/chờ xoá → 'locked'; thu hồi → 'revoked'; còn lại → 'expired'.
  const reason =
    code === 'AUTH_011' || code === 'AUTH_012' ? 'locked' : code === 'AUTH_010' ? 'revoked' : 'expired';
  purgeAuthSession(reason);
});

socket.on(SocketEvent.SESSION_EXPIRING, () => {
  void refreshSession().then((outcome) => {
    if (outcome.status === 'ok') void emitWithAck(SocketEvent.AUTH_REFRESH, { token: outcome.token });
  });
});

socket.on('disconnect', (reason: string) => {
  if (reason === 'io server disconnect') connectSocket();
});
