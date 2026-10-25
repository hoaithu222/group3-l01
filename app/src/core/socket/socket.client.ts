import * as Application from 'expo-application';
import { io, type Socket } from 'socket.io-client';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { getAccessToken, refreshSession } from '@/core/api/session';
import { appConfig } from '@/core/config/env.config';
import { getDeviceId } from '@/core/device/device-id';

/**
 * Client Socket.IO — MỘT thực thể dùng chung cho cả app.
 *
 * ── Vì sao singleton, không tạo lại mỗi màn hình ─────────────────────────────
 * Một kết nối WebSocket dùng chung nghĩa là mọi phòng (`user:{id}`, `ws:{id}`,
 * `ch:{id}`…) chỉ cần join MỘT lần và mọi hook `useSocketEvent` trong app đều
 * nghe trên cùng ống dẫn đó. Tạo mới ở từng màn hình sẽ mở nhiều kết nối song
 * song tới CÙNG server — tốn pin, tốn kết nối phía backend, và tin nhắn có
 * thể tới hai lần nếu chẳng may cả hai đang lắng nghe cùng sự kiện.
 *
 * ── `autoConnect: false` — CỐ Ý ───────────────────────────────────────────────
 * Không kết nối ngay lúc app khởi động: lúc đó có thể còn CHƯA có access token
 * (đang restore phiên) hoặc người dùng CHƯA đăng nhập. Vòng đời kết nối do
 * `AppProviders` điều khiển theo `status` của phiên — xem `connectSocket()` /
 * `disconnectSocket()`.
 *
 * ── `auth` là HÀM, không phải object tĩnh ─────────────────────────────────────
 * `socket.io-client` gọi lại hàm này ở MỖI lượt (re)connect, nên access token
 * luôn là bản MỚI NHẤT trong bộ nhớ — kể cả sau khi `client.ts` đã âm thầm làm
 * mới token vì một request REST khác vừa ăn 401. Đặt `auth: { token }` (object
 * tĩnh, đọc MỘT lần lúc tạo `socket`) sẽ đóng băng token ngay ở giá trị `null`
 * của lần khởi động đầu tiên.
 *
 * ── Bốn field, không chỉ `token` ─────────────────────────────────────────────
 * BE đọc `{token, deviceId, platform, appVersion}` qua `verifyAccessContext`
 * (`docs/plan/config-be.md` §7) cho registry đa thiết bị. `getDeviceId()` là
 * async (đọc SecureStore lần đầu) nên `cb()` gọi BÊN TRONG `.then()` —
 * socket.io-client hỗ trợ `auth` bất đồng bộ đúng để chờ được ca này.
 */
export const socket: Socket = io(appConfig.socketUrl, {
  path: appConfig.socketPath,
  autoConnect: false,
  transports: ['websocket'],
  auth: (cb) => {
    void getDeviceId().then((deviceId) => {
      cb({
        token: getAccessToken(),
        deviceId,
        platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
        appVersion: Application.nativeApplicationVersion ?? 'unknown',
      });
    });
  },
  reconnection: true,
  /**
   * Backoff mũ giữa `reconnectionDelay` và `reconnectionDelayMax`, có rung ngẫu
   * nhiên (`randomizationFactor` mặc định của thư viện) — tự thư viện lo, ở đây
   * chỉ khai hai đầu mút. Cần cả hai: thiếu `reconnectionDelayMax` thì mất mạng
   * dài (đi hầm, máy bay) làm khoảng chờ giữa các lần thử tăng KHÔNG GIỚI HẠN,
   * và khi có sóng lại app có thể mất tới vài phút mới thử kết nối lần kế.
   */
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10_000,
});

/**
 * Chặn refresh chồng refresh khi nhiều lượt `connect_error` bắn liên tiếp
 * (thư viện tự retry) trong lúc một lượt làm mới token đã đang chạy.
 *
 * ⚠️ Không cần khoá riêng cho socket: `refreshSession()` ở `core/api/session.ts`
 * đã tự single-flight (N lời gọi cùng lúc chỉ sinh một request thật) — cờ này
 * chỉ để tránh gọi `refreshSession()` một cách vô ích khi biết chắc nó đang chạy.
 */
let refreshingForSocket = false;

/**
 * Bắt `connect_error` do token hết hạn — làm mới rồi kết nối lại.
 *
 * ⚠️ CHỈ xử lý lỗi có mùi "token" trong thông điệp. Server (`config-be.md` §7:
 * "reject khi hết hạn") không có hợp đồng mã lỗi chuẩn hoá cho bước handshake
 * (khác hẳn REST, nơi có mã lỗi rõ ràng), nên phải đoán qua thông điệp lỗi —
 * đây là lựa chọn CÓ CHỦ Ý, không phải sơ suất. Lỗi mạng thường (đứt sóng,
 * server sập) đã có `reconnection` của thư viện tự lo, không cần đụng vào đây.
 */
socket.on('connect_error', async (err: Error) => {
  if (refreshingForSocket) return;
  if (!/token|jwt|hết hạn|unauthorized/i.test(err.message)) return;

  refreshingForSocket = true;
  try {
    const outcome = await refreshSession();
    // `unauthenticated` ⇒ `refreshSession()` đã dọn phiên; guard điều hướng đã
    // lo phần còn lại, ⛔ KHÔNG cố `connect()` lại ở đây (sẽ ăn lỗi y hệt, vòng
    // lặp vô ích). `unavailable` cũng không kết nối lại — mất mạng thì để cơ
    // chế `reconnection` của chính socket.io tự thử theo backoff.
    if (outcome.status === 'ok') socket.connect();
  } finally {
    refreshingForSocket = false;
  }
});

/** Nối lại — bỏ qua êm nếu đã nối hoặc chưa có phiên đăng nhập nào. */
export function connectSocket(): void {
  if (socket.connected) return;
  if (!getAccessToken()) return;
  socket.connect();
}

/** Ngắt — bỏ qua êm nếu đã ngắt sẵn. */
export function disconnectSocket(): void {
  if (!socket.connected) return;
  socket.disconnect();
}

/**
 * Theo dõi `AppState` để tiết kiệm pin/kết nối phía backend.
 *
 * Quy tắc: nền QUÁ 5 phút thì ngắt hẳn; quay lại (hoặc quay lại TRƯỚC khi hết
 * 5 phút) thì nối lại ngay. 5 phút chứ không phải ngắt NGAY khi xuống nền —
 * người dùng chuyển qua app khác đọc một tin nhắn rồi quay lại trong vài giây
 * là chuyện thường, ngắt/nối liên tục kiểu đó tốn pin hơn là giữ kết nối.
 *
 * ⛔ Gọi ĐÚNG MỘT LẦN lúc khởi động (`AppProviders`) và nhớ gọi hàm dọn dẹp nó
 * trả về lúc unmount — bỏ qua bước dọn thì mỗi lần `AppProviders` remount
 * (hiếm, nhưng xảy ra trong Fast Refresh lúc phát triển) lại cộng thêm một
 * listener, và `setTimeout` cũ không bị huỷ sẽ ngắt kết nối SAI LÚC.
 */
export function bindAppState(): () => void {
  let backgroundTimer: ReturnType<typeof setTimeout> | null = null;

  const clearBackgroundTimer = () => {
    if (backgroundTimer) {
      clearTimeout(backgroundTimer);
      backgroundTimer = null;
    }
  };

  const onChange = (state: AppStateStatus) => {
    if (state === 'active') {
      clearBackgroundTimer();
      connectSocket();
    } else if (!backgroundTimer) {
      backgroundTimer = setTimeout(disconnectSocket, 5 * 60_000);
    }
  };

  const subscription = AppState.addEventListener('change', onChange);
  return () => {
    subscription.remove();
    clearBackgroundTimer();
  };
}
