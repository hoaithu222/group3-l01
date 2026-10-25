import { useWhiteboardSessionStore } from './whiteboard-session.store';
import { useWhiteboardUiStore } from './whiteboard-ui.store';

/**
 * Dọn mọi store của Bảng trắng — gọi từ bước `whiteboard` của `wipeUserData()` (`shell/session/wipe-steps.ts`) khi đăng xuất/phiên chết/đổi tài
 * khoản, và từ chính màn vẽ khi vào/rời (`useWhiteboardScreenReset`). Idempotent. Phiên collab (Y.Doc, provider) KHÔNG nằm trong store: nó gắn
 * với vòng đời của màn vẽ nên bị huỷ khi màn gỡ; đường rời phiên luôn đẩy về đăng nhập nên màn vẽ gỡ theo.
 * Tuỳ chọn cá nhân trên đĩa (`u:<userId>:wb.*`) do `removeAllForUser` xoá — không cần dòng nào ở đây.
 */
export function resetWhiteboardStores(): void {
  useWhiteboardUiStore.getState().reset();
  useWhiteboardSessionStore.getState().reset();
}
