import { useEffect } from 'react';

import { wipeLocalPushState } from '@/core/notifications';
import { useAuthStore } from '@/shell/store/slices/auth';

import { clearPrimerRecord } from './push-primer';

/**
 * Rời phiên đăng nhập (đăng xuất CHỦ ĐỘNG lẫn phiên chết do 401) → dọn thông báo CỤC BỘ (p0-06 `app.md` §5,
 * NT-07): xoá thông báo còn trên khay, đưa huy hiệu về 0, quên trạng thái primer của người vừa rời.
 *
 * Đăng ký qua `useAuthStore.subscribe` thay vì effect phụ thuộc `status`: cần `prev.user.id` để xoá đúng
 * khoá primer, mà effect chỉ thấy giá trị mới (`user` đã `null`). Cũng không dính chuyện React StrictMode
 * chạy effect hai lần lúc dev (một effect "dọn khi cleanup" sẽ dọn khay ngay lúc khởi động).
 *
 * ⚠️ Chỉ dọn phía máy. Gỡ token khỏi BE (`unregisterThisDevice`) cần access token nên do `useLogout` làm,
 * TRƯỚC khi phiên bị dọn; phiên chết do 401 thì không còn token để gọi — xem "Điểm lệch" ở `app.md`.
 */
export function usePushSessionCleanup(): void {
  useEffect(() => {
    return useAuthStore.subscribe((state, previous) => {
      if (previous.status !== 'authenticated' || state.status === 'authenticated') return;

      void wipeLocalPushState();
      const previousUserId = previous.user?.id;
      if (previousUserId) void clearPrimerRecord(previousUserId);
    });
  }, []);
}
