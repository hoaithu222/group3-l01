import { useEffect, useRef } from 'react';

/** Chờ bao lâu rồi tải lại MỘT lần khi báo cáo còn `stale` (app.md §4). */
export const STALE_REFETCH_MS = 60_000;

/**
 * Báo cáo `stale: true` = còn thay đổi chưa vào bản tính sẵn (server đang tính lại). Đợi 60 giây rồi tải lại ĐÚNG MỘT LẦN cho mỗi
 * `resetKey` (bảng + kỳ): nếu sau đó vẫn `stale` thì KHÔNG hẹn tiếp — job kẹt thì người dùng có banner + kéo để làm mới, chứ app không
 * đập server mỗi phút. `stale` trở về `false` (tính xong) thì mở lại quyền hẹn cho lần `stale` kế tiếp.
 */
export function useStaleRefetch(stale: boolean, resetKey: string, refetch: () => unknown): void {
  const refetchRef = useRef(refetch);
  const armedKey = useRef<string | null>(null);

  useEffect(() => {
    refetchRef.current = refetch;
  });

  useEffect(() => {
    if (!stale) {
      armedKey.current = null;
      return undefined;
    }
    if (armedKey.current === resetKey) return undefined;
    const timer = setTimeout(() => {
      armedKey.current = resetKey;
      void refetchRef.current();
    }, STALE_REFETCH_MS);
    return () => clearTimeout(timer);
  }, [stale, resetKey]);
}
