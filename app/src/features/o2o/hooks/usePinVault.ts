import { useEffect, useState } from 'react';

import { useAuthStore } from '@/shell/store/slices/auth';

import { clearPin, readPin } from '../utils/pin-vault';

/**
 * PIN nhận hàng của MỘT đơn, đọc từ kho khoá (`utils/pin-vault.ts`).
 *
 * `live` = đơn còn ở trạng thái PIN dùng được (đã gửi, chưa kết thúc); `undefined` = chưa biết (đơn đang tải). Đơn đã kết thúc thì hook XOÁ PIN khỏi kho khoá thay vì đọc: socket
 * (`usePrintOrderSocket`) đã xoá khi nhận tin, nhưng người dùng có thể mở màn vé sau khi đơn kết thúc lúc app đóng — lượt này dọn nốt.
 *
 * `ready` = đã đọc xong kho khoá. ⚠️ Kho khoá chậm (đi qua mã hoá của hệ điều hành), nên màn PHẢI chờ `ready` trước khi kết luận "mất PIN"
 * và mời "Tạo PIN mới" — kết luận sớm là nháy nút tạo PIN mới (huỷ PIN cũ vô cớ) cho người có PIN đàng hoàng.
 * `setPin` để màn cập nhật ngay sau khi tạo PIN mới, không đọc lại kho.
 */
export function usePinVault(orderId: string | undefined, live: boolean | undefined) {
  const userId = useAuthStore((state) => state.user?.id);
  const [pin, setPin] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // ⛔ `live` chưa biết (đơn còn đang tải) thì KHÔNG đụng vào kho khoá: coi "chưa biết" là "đã kết thúc" sẽ xoá PIN của đơn đang chạy.
    if (live === undefined) return undefined;
    let alive = true;
    void (async () => {
      let value: string | null = null;
      if (userId && orderId) {
        if (live) value = await readPin(userId, orderId);
        else await clearPin(userId, orderId);
      }
      if (!alive) return;
      setPin(value);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [userId, orderId, live]);

  return { pin, ready, setPin };
}
