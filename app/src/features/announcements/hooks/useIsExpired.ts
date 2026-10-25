import { useEffect, useState } from 'react';

import { serverNowMs } from '@/shell/store/slices/clock/clock.store';

import { isExpiredAt, type ExpiryFields } from '../utils/announcement-status';

/** `setTimeout` chỉ nhận tới 2^31−1 ms (~24,8 ngày) mà hạn có thể dài 30 ngày — cắt bớt rồi hẹn lại ở lượt sau. */
const MAX_TIMEOUT_MS = 2_000_000_000;
/** Chờ thêm chút sau hạn để đồng hồ máy chủ (đã hiệu chỉnh) chắc chắn đã qua mốc. */
const GRACE_MS = 50;

/**
 * Yêu cầu đã hết hạn chưa — tự lật sang `true` đúng lúc qua `deadlineAt` dù màn cứ mở (BE không phát sự kiện khi hết hạn).
 * `undefined` (không có yêu cầu) ⇒ `false`. "Bây giờ" nằm trong state để render thuần (xem `isExpiredAt`).
 */
export function useIsExpired(view: ExpiryFields | undefined): boolean {
  const [nowMs, setNowMs] = useState(serverNowMs);
  const deadlineAt = view?.deadlineAt ?? null;
  const expired = view !== undefined && isExpiredAt(view, nowMs);

  useEffect(() => {
    if (expired || deadlineAt === null) return;
    const remaining = Date.parse(deadlineAt) - serverNowMs();
    const timer = setTimeout(
      () => setNowMs(serverNowMs()),
      Math.min(Math.max(remaining, 0) + GRACE_MS, MAX_TIMEOUT_MS),
    );
    return () => clearTimeout(timer);
  }, [expired, deadlineAt, nowMs]);

  return expired;
}
