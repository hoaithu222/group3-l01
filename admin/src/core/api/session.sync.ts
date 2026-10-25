/**
 * Đồng bộ VÒNG ĐỜI PHIÊN giữa các tab cùng trình duyệt.
 *
 * Mọi tab dùng chung một cookie refresh (HttpOnly), nhưng mỗi tab giữ access
 * token và React Query cache RIÊNG trong bộ nhớ. Không có tín hiệu qua lại thì:
 *   - đăng xuất ở tab này, tab kia vẫn hiện dữ liệu và còn gọi được API tới khi
 *     access token (15 phút) hết hạn — trên máy dùng chung là lỗ hổng thật;
 *   - đăng nhập ở tab này, tab đang mở trang đăng nhập vẫn hiện form.
 *
 * File này chỉ gửi tin; bên nhận là `useSessionSync` (features/auth) qua
 * `useMultiTabSync`. Lớp truyền tin (BroadcastChannel / `storage`) nằm ở
 * `@/shared/utils/browser/tab-sync.utils`.
 */
import type { SessionEndReason } from '@/app/store';
import { AUTH_SYNC_CHANNEL } from '@/core/config/auth.config';
import { postTabMessage } from '@/shared/utils/browser/tab-sync.utils';

export type AuthSyncMessage =
  | { type: 'ended'; reason: SessionEndReason | null; from: string }
  | { type: 'started'; from: string };

/**
 * Định danh của TAB này. `BroadcastChannel` giao tin cho mọi đối tượng kênh khác
 * cùng tên — kể cả subscriber nằm CÙNG tab với người gửi — nên bên nhận phải tự
 * lọc tin của chính mình.
 *
 * `crypto.randomUUID` chỉ có ở ngữ cảnh an toàn (HTTPS / localhost); mở admin qua
 * `http://192.168.x.x` là hàm này không tồn tại → dự phòng, đừng để mất cả app
 * chỉ vì một định danh tab.
 */
const makeTabId = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
};

const TAB_ID = makeTabId();

/** Tin có phải do chính tab này gửi không. */
export const isFromThisTab = (message: AuthSyncMessage): boolean => message.from === TAB_ID;

/** Báo các tab khác: phiên đã kết thúc (`reason` `null` = người dùng tự đăng xuất). */
export const announceSessionEnded = (reason: SessionEndReason | null): void =>
  postTabMessage<AuthSyncMessage>(AUTH_SYNC_CHANNEL, { type: 'ended', reason, from: TAB_ID });

/** Báo các tab khác: vừa đăng nhập xong — tab đang ở trang đăng nhập nên khôi phục phiên. */
export const announceSessionStarted = (): void =>
  postTabMessage<AuthSyncMessage>(AUTH_SYNC_CHANNEL, { type: 'started', from: TAB_ID });
