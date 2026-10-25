import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { inviteHref } from '../utils/invite-routes';
import { parseInviteInput } from '../utils/parse-invite-input';

/**
 * Sau một lần quét SAI, chờ chừng này rồi mới cho quét lại. `onBarcodeScanned` bắn liên tục chừng nào mã còn
 * trong khung — không chờ thì nhãn lỗi nhấp nháy mỗi nhịp và người dùng không kịp đọc.
 */
export const INVALID_SCAN_COOLDOWN_MS = 1500;

/**
 * Xử lý kết quả `onBarcodeScanned`: bóc mã mời → điều hướng ĐÚNG MỘT LẦN; không phải link mời → báo và cho quét lại.
 *
 * ⛔ Khoá bằng REF, không bằng state: camera bắn nhiều lần trước khi React kịp vẽ lại với state mới, nên khoá
 * bằng state vẫn để lọt vài lần gọi liền nhau ⇒ `router.replace` chạy hai ba lần và màn đích bị dựng chồng.
 * Ref đổi ngay tại chỗ, lần gọi sau đọc thấy liền.
 *
 * ✅ `router.replace` (không phải `push`): quét xong màn này hết việc. `push` để camera vẫn mở dưới màn đích, và
 * người dùng bấm Back sẽ quay về một máy quét đã KHOÁ (lần quét đầu không bao giờ mở khoá) — nhìn như treo.
 */
export function useInviteScan() {
  const [invalid, setInvalid] = useState(false);
  const locked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rời màn giữa lúc chờ mở khoá: huỷ hẹn giờ, không thì `setInvalid` chạy trên component đã gỡ.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function onScanned(data: string): void {
    if (locked.current) return;
    locked.current = true;

    const parsed = parseInviteInput(data);
    if (parsed) {
      // ⚠️ KHÔNG mở khoá ở nhánh này — đó chính là "chỉ một lần".
      router.replace(inviteHref(parsed));
      return;
    }

    setInvalid(true);
    timer.current = setTimeout(() => {
      locked.current = false;
      setInvalid(false);
    }, INVALID_SCAN_COOLDOWN_MS);
  }

  return { invalid, onScanned };
}
