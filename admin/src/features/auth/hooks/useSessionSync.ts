import { useAuthStore } from '@/app/store';
import { purgeAuthSession } from '@/core/api/session';
import { isFromThisTab, type AuthSyncMessage } from '@/core/api/session.sync';
import { AUTH_SYNC_CHANNEL } from '@/core/config';
import { useMultiTabSync } from '@/shared/hooks';
import { reconcileSession } from '../service/session-restore';

/**
 * Nghe tab khác báo vòng đời phiên (đăng xuất / đăng nhập) — bên GỬI là
 * `@/core/api/session.sync`.
 *
 *  - `ended`   → dọn phiên tab này NGAY, không gọi lại BE (tab kia đã thu hồi phiên rồi). Tắt
 *    `broadcast` để hai tab không dội tin qua lại. Tab đang ở trang đăng nhập bỏ qua: nó không
 *    có phiên nào để dọn, và lời nhắn "phiên hết hạn" chỉ làm người dùng hoang mang.
 *  - `started` → đối chiếu với cookie (`reconcileSession`).
 *
 * Tin do chính tab này gửi bị bỏ qua (`BroadcastChannel` vẫn giao cho subscriber cùng tab).
 */
export function useSessionSync(): void {
  useMultiTabSync<AuthSyncMessage>(AUTH_SYNC_CHANNEL, (message) => {
    if (isFromThisTab(message)) return;

    if (message.type === 'ended') {
      if (useAuthStore.getState().status === 'anonymous') return;
      purgeAuthSession(message.reason, { broadcast: false });
      return;
    }
    void reconcileSession();
  });
}
