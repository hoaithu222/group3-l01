import type { QueryClient } from '@tanstack/react-query';

import { pomodoroKeys } from '../api/pomodoro.keys';
import type { PomodoroSnapshot } from '../api/pomodoro.types';
import { usePomodoroStore } from '../store/pomodoro.store';
import { clockOffset } from '../utils/clock';
import { mergeSnapshot, needsReconcile } from '../utils/snapshot';

/**
 * ĐIỂM DUY NHẤT ghi snapshot vào cache từ nguồn ngoài `queryFn` (socket `pomodoro:updated`, kết quả lệnh/vào phòng/cấu hình): đo lệch
 * đồng hồ, gộp theo luật `mergeSnapshot` (bản cũ bị bỏ), và ghi nhận "phiên vừa kết thúc khi tôi đang trong phòng" cho tấm kết quả.
 * `reconcile = true` ⇒ nơi gọi nên tải lại REST (đổi chủ phòng/phiên: `myActions` suy ra ở client có thể lệch).
 */
export function applySnapshot(
  queryClient: QueryClient,
  channelId: string,
  next: PomodoroSnapshot,
  myId: string | undefined,
): { merged: PomodoroSnapshot; reconcile: boolean } {
  const key = pomodoroKeys.snapshot(channelId);
  const prev = queryClient.getQueryData<PomodoroSnapshot>(key);
  const store = usePomodoroStore.getState();
  store.pushOffset(channelId, clockOffset(next.serverNow));

  const merged = mergeSnapshot(prev, next, myId);
  queryClient.setQueryData<PomodoroSnapshot>(key, merged);

  const firstSeenEnd = next.phase === 'ENDED' && !(prev?.phase === 'ENDED' && prev.sessionId === next.sessionId);
  if (merged !== prev && firstSeenEnd && next.sessionId && store.room.channelId === channelId) {
    store.setEnded({ channelId, sessionId: next.sessionId });
  }
  // Phiên vừa KẾT THÚC ⇒ lịch sử học (màn "Lịch sử Pomodoro" ở tab Tôi, vẫn mounted) và "Giờ tập trung" tuần ở Trang chủ
  // (`['pomodoro','history','week']` — cùng tiền tố `history()`) có thêm một lượt. Không có dòng này thì cả hai đứng yên.
  if (merged !== prev && firstSeenEnd) {
    void queryClient.invalidateQueries({ queryKey: pomodoroKeys.history() });
  }
  return { merged, reconcile: merged !== prev && needsReconcile(prev, next) };
}
