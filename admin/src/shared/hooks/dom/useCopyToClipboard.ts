import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Chép văn bản vào clipboard, cờ `copied` tự tắt sau `resetDelay`.
 *
 * Bộ đếm giữ trong ref và bị huỷ trước mỗi lần chép mới: không có nó thì chép
 * hai lần liên tiếp sẽ để bộ đếm của lần ĐẦU tắt cờ của lần SAU — dấu "đã chép"
 * biến mất sớm hơn mong đợi. Effect dọn lúc unmount để không `setState` lên
 * component đã gỡ.
 */
export function useCopyToClipboard(resetDelay = 2000): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const copyToClipboard = useCallback(
    async (text: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        timerRef.current = setTimeout(() => setCopied(false), resetDelay);
      } catch {
        // Không có quyền clipboard, hoặc trang không chạy trên ngữ cảnh bảo mật.
        setCopied(false);
      }
    },
    [resetDelay],
  );

  return [copied, copyToClipboard];
}
