import { useEffect, useRef } from 'react';

import { appConfig } from '@/core/config';
import { useAuthStore } from '@/app/store';
import { ensureProfile, restoreSession } from '../service/session-restore';

interface SessionBootstrapOptions {
  /**
   * Chỉ khôi phục khi trình duyệt có dấu hiệu từng đăng nhập (hồ sơ đã persist). Dùng cho
   * trang KHÁCH: người chưa từng đăng nhập vào `/login` không cần một lượt `refresh` vô ích
   * (mà chắc chắn 401) chỉ để biết mình chưa đăng nhập.
   */
  onlyWithHint?: boolean;
}

/**
 * Khôi phục phiên MỘT LẦN khi app khởi động — xem `restoreSession` để biết ba kết cục
 * (`ok` / `unauthenticated` / `unavailable`) và vì sao mất mạng KHÔNG được coi là "chưa
 * đăng nhập".
 *
 * Endpoint refresh trả về cả hồ sơ người dùng, nên một lượt gọi là đủ — không cần thêm
 * vòng /me.
 *
 * ⛔ Cờ `ranRef` KHÔNG được bỏ: React StrictMode chạy effect hai lần ở môi trường phát triển;
 * gọi refresh hai lượt song song sẽ khiến BE xoay vòng refresh token và vô hiệu hoá lượt
 * đầu — phiên tự rơi ngay sau khi vào. (Hai guard cùng gọi hook này cũng không chạy trùng:
 * `restoreSession` đổi `status` khỏi `idle` ngay lập tức.)
 *
 * Không chạy khi `appConfig.authEnabled` tắt: base xuất xưởng chưa có backend nào, gọi
 * `refresh` lúc đó chỉ tạo một request đỏ trong tab Network ở MỌI lần tải trang, làm người
 * mới tưởng base hỏng.
 */
export function useSessionBootstrap({ onlyWithHint = false }: SessionBootstrapOptions = {}): void {
  const status = useAuthStore((s) => s.status);
  const hasHint = useAuthStore((s) => s.user !== null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (!appConfig.authEnabled || ranRef.current || status !== 'idle') return;
    if (onlyWithHint && !hasHint) return;
    ranRef.current = true;
    void restoreSession();
  }, [status, hasHint, onlyWithHint]);

  // Có token mà chưa có hồ sơ (BE quên `user` ở login/refresh): lấy `/auth/me` thay vì để guard kẹt.
  useEffect(() => {
    if (appConfig.authEnabled && status === 'authenticated' && !hasHint) void ensureProfile();
  }, [status, hasHint]);
}
