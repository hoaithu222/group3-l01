import { useBlockedUsersStore } from './blocked-users.store';
import { useModerationIntentStore } from './moderation-intent.store';

/**
 * Xoá state cục bộ của báo cáo/chặn (p1-08) — gọi từ `shell/session/useLogout.ts` cùng `queryClient.clear()`.
 * Danh sách chặn là của TÀI KHOẢN: không dọn thì người dùng SAU trên cùng máy thấy tin của người mà người
 * TRƯỚC đã chặn bị thu gọn, và một tấm Báo cáo đang mở dở còn nguyên đích của người trước.
 */
export function resetModerationStores(): void {
  useBlockedUsersStore.getState().reset();
  useModerationIntentStore.getState().reset();
}
