import { usePomodoroStore } from '../store/pomodoro.store';
import { teardownPomodoroSession } from './pomodoro-session.controller';

/**
 * Bước dọn của `wipeUserData()` (`shell/session/wipe-steps.ts`). Controller LiveKit giữ kết nối NGOÀI React: phải ngắt media (dừng mic/camera,
 * tắt phiên âm thanh) chứ không chỉ xoá store — không thì âm thanh chạy tiếp cho người vừa đăng xuất. Idempotent (wipe chạy hơn một lần):
 * `disconnect()` của cổng media là no-op khi chưa có phiên, và lỗi ngắt không được chặn việc xoá store.
 */
export async function resetPomodoroStores(): Promise<void> {
  await teardownPomodoroSession().catch(() => undefined);
  usePomodoroStore.getState().reset();
}
