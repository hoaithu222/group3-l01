import { useEffect, useRef } from 'react';

/**
 * Tới `joinOpensAt` (phòng chờ mở) thì làm mới chi tiết MỘT lần để server tính lại `myActions` (`canJoin`/`canStart`).
 * ⛔ Client KHÔNG tự bật quyền vào phòng chỉ vì đồng hồ (README p2-04 §4.1 "không tự suy quyền"): đồng hồ chỉ báo "đã tới lúc hỏi
 * lại server". Chỉ bắn khi CHỨNG KIẾN đếm ngược chạy từ > 0 về 0 — mở màn khi đã quá mốc thì dữ liệu vừa tải đã đúng, không refetch.
 */
export function useJoinWindowRefetch(joinRemainingMs: number, refetch: () => unknown): void {
  const previous = useRef(joinRemainingMs);

  useEffect(() => {
    if (previous.current > 0 && joinRemainingMs === 0) refetch();
    previous.current = joinRemainingMs;
  }, [joinRemainingMs, refetch]);
}
