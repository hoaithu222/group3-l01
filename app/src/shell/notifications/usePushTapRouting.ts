import * as Notifications from 'expo-notifications';
import { router, useRootNavigationState } from 'expo-router';
import { useEffect } from 'react';

import { decidePushTap, extractPushData, parsePushPayload } from '@/core/notifications';
import { useAuthStore } from '@/shell/store/slices/auth';

/**
 * Id các lượt chạm ĐÃ xử lý. `useLastNotificationResponse()` giữ nguyên giá trị cho tới khi bị xoá, và
 * effect chạy lại mỗi khi `status`/`userId` đổi — không có tập này thì một lần chạm điều hướng lặp lại
 * mỗi lần token refresh đổi `user`.
 */
const handledResponses = new Set<string>();

/** CHỈ dùng trong test. */
export function __resetHandledPushResponsesForTests(): void {
  handledResponses.clear();
}

/**
 * Chạm vào thông báo → mở màn tương ứng (p0-06 `app.md` §4 "Tap"), cả khi app đang chạy lẫn khi
 * KHỞI ĐỘNG NGUỘI từ thông báo (`useLastNotificationResponse` trả lượt chạm đã mở app).
 *
 * Chờ đủ hai điều kiện rồi mới điều hướng, không thì bỏ lượt chạm hoặc giữ lại:
 *  · Phiên `authenticated` + có `user.id` — cần để kiểm `targetUserId` (NT-07). Đang `idle`/`restoring`
 *    thì GIỮ (effect chạy lại khi phiên xong); đã `anonymous` thì BỎ — người dùng phải đăng nhập, và
 *    nhảy tới một màn cũ ngay sau đăng nhập thì lạ hơn là mở trang chủ.
 *  · Navigator gốc đã dựng (`useRootNavigationState().key`) — `router.push` trước lúc đó bị nuốt hoặc
 *    ném "navigate before mounting the Root Layout". Lượt chạm lúc mở nguội tới TRƯỚC khi cây route
 *    dựng xong (`app/_layout.tsx` trả `null` tới khi khôi phục xong phiên).
 *
 * ⛔ Không hard-code route ở đây — `decidePushTap`/`resolvePushHref` là nơi duy nhất map payload → route.
 */
export function usePushTapRouting(): void {
  const response = Notifications.useLastNotificationResponse();
  const status = useAuthStore((state) => state.status);
  const userId = useAuthStore((state) => state.user?.id);
  const navigatorReady = Boolean(useRootNavigationState()?.key);

  useEffect(() => {
    if (!response) return;
    // Chỉ lượt chạm vào thân thông báo. Nút hành động (chưa có) hoặc "vuốt bỏ" không được mở màn.
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;

    const responseId = response.notification.request.identifier;
    if (handledResponses.has(responseId)) return;

    const payload = parsePushPayload(extractPushData(response.notification));
    const outcome = decidePushTap(payload, { authenticated: status === 'authenticated', userId });

    if (outcome.kind === 'ignored' && outcome.reason === 'not-authenticated') {
      // Còn đang khôi phục phiên → giữ lại, chạy lại khi `status` đổi.
      if (status === 'idle' || status === 'restoring') return;
    } else if (outcome.kind === 'navigate' && !navigatorReady) {
      return;
    }

    handledResponses.add(responseId);
    Notifications.clearLastNotificationResponse();
    if (outcome.kind === 'navigate') router.push(outcome.href);
  }, [navigatorReady, response, status, userId]);
}
