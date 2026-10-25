import { useEffect, useState } from 'react';

import { remainingMs } from '../utils/clock';

/** Số giây còn lại của câu, tính theo đồng hồ server (`offsetMs`), cập nhật 4 lần/giây. */
export function useQuizCountdown(deadlineAt: number | undefined, offsetMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadlineAt) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [deadlineAt]);

  if (!deadlineAt) return 0;
  // `now` chỉ để re-render theo nhịp; phép tính đọc lại đồng hồ trong `remainingMs`.
  return now > 0 ? Math.ceil(remainingMs(deadlineAt, offsetMs) / 1000) : 0;
}
