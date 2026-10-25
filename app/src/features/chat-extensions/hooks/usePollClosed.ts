import { useEffect, useState } from 'react';

import { serverNowMs } from '@/shell/store/slices/clock/clock.store';

import type { PollView } from '../api/chat-extensions.types';
import { isPollClosed } from '../utils/poll-cache';

/** `setTimeout` chỉ nhận tới 2^31−1 ms (~24,8 ngày) mà hạn khảo sát có thể dài 30 ngày — cắt bớt rồi hẹn lại ở lượt sau. */
const MAX_TIMEOUT_MS = 2_000_000_000;
/** Chờ thêm chút sau hạn để đồng hồ máy chủ (đã hiệu chỉnh) chắc chắn đã qua mốc. */
const GRACE_MS = 50;

/**
 * Khảo sát đã kết thúc chưa — tự lật sang `true` đúng lúc qua `closesAt` dù màn cứ mở (job đóng của BE phát `poll:updated`, nhưng mất mạng đúng lúc đó thì thẻ vẫn phải khoá
 * lựa chọn: BE từ chối bầu bằng `POLL_004`). "Bây giờ" nằm trong state để render thuần (React Compiler cấm `Date.now()` trong lúc vẽ) — cùng mẫu `useIsExpired` của `announcements`.
 */
export function usePollClosed(poll: Pick<PollView, 'status' | 'closesAt'>): boolean {
  const [nowMs, setNowMs] = useState(serverNowMs);
  const closed = isPollClosed(poll, nowMs);
  const { closesAt } = poll;

  useEffect(() => {
    if (closed || closesAt === null) return;
    const remaining = Date.parse(closesAt) - serverNowMs();
    const timer = setTimeout(
      () => setNowMs(serverNowMs()),
      Math.min(Math.max(remaining, 0) + GRACE_MS, MAX_TIMEOUT_MS),
    );
    return () => clearTimeout(timer);
  }, [closed, closesAt, nowMs]);

  return closed;
}
