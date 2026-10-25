import { onlineManager } from '@tanstack/react-query';

import { getNetworkSnapshot, subscribeNetwork } from './network-state';

/**
 * Nối `onlineManager` của React Query với trạng thái mạng của máy (p0-12 app.md §4 "Online").
 *
 * ── Vì sao phải nối ──────────────────────────────────────────────────────────
 * React Query tự nghe sự kiện `online`/`offline` của TRÌNH DUYỆT — React Native không có, nên mặc định nó luôn tin
 * "đang online": `refetchOnReconnect: true` ở `query-client.ts` (tín hiệu ĐÚNG của di động — vừa có sóng lại thì dữ liệu
 * trên màn chắc chắn cũ) là cấu hình CHẾT cho tới khi có cầu nối này.
 *
 * ── Ranh giới: nối để có SỰ KIỆN, không để đổi cách gọi ──────────────────────
 * ⛔ Cầu nối này KHÔNG được làm query/mutation tạm dừng khi ngoại tuyến. Chế độ mặc định `networkMode: 'online'` sẽ treo
 * mọi request ở trạng thái "paused" — màn đang mở thấy skeleton mãi thay vì "Không tải được / Bạn đang ngoại tuyến",
 * nút Lưu quay mãi thay vì báo lỗi kết nối — và hàng chục màn hiện có được viết theo giả định request THẤT BẠI NGAY khi
 * mất sóng (ví "Kết nối lại để lưu", tìm kiếm "Cần kết nối để tìm"). Nên `query-client.ts` đặt `networkMode: 'always'`:
 * request vẫn chạy (và hỏng ngay nếu mất mạng), còn `onlineManager` chỉ phát sự kiện để `refetchOnReconnect` chạy.
 * Feature nào muốn tạm dừng thật thì khai `networkMode: 'online'` riêng ở hook đó và tự vẽ trạng thái `isPaused`.
 *
 * Idempotent; gọi MỘT lần ở TẦM MODULE của `AppProviders` (trước khi `QueryClientProvider` gắn).
 */
let initialised = false;

export function initOnlineManager(): void {
  if (initialised) return;
  initialised = true;

  onlineManager.setEventListener((setOnline) => {
    setOnline(getNetworkSnapshot().isOnline);
    return subscribeNetwork(() => setOnline(getNetworkSnapshot().isOnline));
  });
}

/** CHỈ dùng trong test: cho phép nối lại sau khi đã dọn. */
export function __resetOnlineManagerForTests(): void {
  initialised = false;
}
