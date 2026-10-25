import { useEffect, useState } from 'react';

/**
 * "Bây giờ" trong STATE + hẹn giờ làm mới — ⛔ không đọc `Date.now()` trong thân render: React Compiler (bật ở
 * `app.config.ts`) ghi nhớ kết quả theo đầu vào, "còn N ngày" sẽ đứng im mãi (mẫu `announcements/hooks/useIsExpired.ts`).
 *
 * Nằm ở `shared` vì hai feature cùng cần đúng cách đọc "còn bao lâu": `mentor` (đợt cố vấn) và `members` (nhãn cố vấn ở danh sách thành viên).
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
