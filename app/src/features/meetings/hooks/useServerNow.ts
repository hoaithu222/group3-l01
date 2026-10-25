import { useEffect, useState } from 'react';

/**
 * "Bây giờ" theo GIỜ SERVER (ms): `serverNow` đúng tại lúc nhận response, nên giờ server hiện tại = `serverNow + (đồng hồ máy bây giờ −
 * receivedAtMs)`. Hai máy lệch đồng hồ vẫn thấy cùng một khoảnh khắc (README p2-04 §4.1, `02-conventions.md` §2 "Thời gian").
 *
 * `receivedAtMs` = `Date.now()` của máy LÚC NHẬN `serverNow` (đóng dấu ở service). Không truyền thì lấy mốc lúc gắn hook — đúng khi
 * `serverNow` vừa về; SAI nếu dữ liệu đã nằm trong cache một lúc (lệch đúng bằng tuổi của cache) nên nơi dùng dữ liệu cache phải truyền.
 * Offset tính lại mỗi lần render từ hai giá trị đó ⇒ response mới (refetch) tự cập nhật, không cần state.
 *
 * Tick mỗi giây; ngừng khi `enabled = false` hoặc đã tới `stopAtMs` (không đốt pin để đếm một mốc đã qua). Không có `serverNow` ⇒ offset 0.
 */
export function useServerNow(
  serverNow: string | undefined,
  enabled = true,
  stopAtMs?: number,
  receivedAtMs?: number,
): number {
  const [mountedAt] = useState(() => Date.now());
  const [tick, setTick] = useState(() => Date.now());
  const offset = serverNow ? Date.parse(serverNow) - (receivedAtMs ?? mountedAt) : 0;
  const now = tick + offset;
  const running = enabled && !(stopAtMs !== undefined && now >= stopAtMs);

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  return now;
}
