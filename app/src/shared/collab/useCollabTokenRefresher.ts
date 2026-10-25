import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { CollabRefreshScheduler } from './collab-refresh-scheduler';
import type { CollabGrant } from './collab-token.types';
import type { CollabTokenProvider } from './collab-token-provider';

export interface UseCollabTokenRefresherOptions {
  onGiveUp?: (error: unknown) => void;
  /** Có token mới (đã làm mới trước hạn) — gửi `setToken` cho WebView. */
  onGrant: (grant: CollabGrant) => void;
  provider: CollabTokenProvider;
}

/**
 * Bộ hẹn giờ làm mới token gắn vào vòng đời màn hình: trả `start(grant)` để gọi SAU MỖI lượt có token (`init` hoặc `setToken` đáp
 * `requestToken`), tự dừng khi màn hình gỡ, và kiểm lại hạn khi app trở lại nền trước.
 *
 * `onGrant`/`onGiveUp` đọc qua ref: nơi gọi thường truyền hàm nội tuyến, đưa vào deps là dựng lại bộ hẹn (mất hẹn cũ) ở mọi lần vẽ.
 */
export function useCollabTokenRefresher({
  onGiveUp,
  onGrant,
  provider,
}: UseCollabTokenRefresherOptions): { start: (grant: CollabGrant) => void } {
  const handlers = useRef({ onGiveUp, onGrant });
  useEffect(() => {
    handlers.current = { onGiveUp, onGrant };
  });

  const scheduler = useRef<CollabRefreshScheduler | null>(null);

  useEffect(() => {
    const next = new CollabRefreshScheduler({
      onGiveUp: (error) => handlers.current.onGiveUp?.(error),
      onGrant: (grant) => handlers.current.onGrant(grant),
      provider,
    });
    scheduler.current = next;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') next.nudge();
    });
    return () => {
      subscription.remove();
      next.stop();
      scheduler.current = null;
    };
  }, [provider]);

  return { start: (grant) => scheduler.current?.start(grant) };
}
