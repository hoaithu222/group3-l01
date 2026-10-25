import { useCallback, useEffect, useRef } from 'react';

import { emitWithAck } from '../socket.ack';
import { SocketEvent } from '../socket.events';

const START_THROTTLE_MS = 3000;
const STOP_AFTER_IDLE_MS = 2000;

export interface UseTypingEmitterResult {
  /** Gắn vào `onChangeText` của ô soạn — throttle 3s cho `typing:start`, tự đặt lại hẹn giờ 2s im lặng. */
  onChangeText: () => void;
  /** Gắn vào `onBlur` và gọi NGAY SAU khi gửi tin — dừng gõ chủ động, huỷ hẹn giờ 2s đang chờ. */
  stop: () => void;
}

/**
 * Phát `typing:start`/`typing:stop` cho một scope, theo ba mốc của `app.md` §2:
 * throttle 3s cho `start` (gõ liên tục không spam sự kiện), và `stop` khi GỬI
 * tin nhắn, khi BLUR ô soạn, hoặc sau 2s không gõ tiếp — cả ba đều đi qua
 * `stop()` để chỉ có MỘT chỗ quyết định "còn đang gõ hay không".
 */
export function useTypingEmitter(
  scopeType: string,
  scopeId: string,
  threadId?: string,
): UseTypingEmitterResult {
  const lastStartAt = useRef(0);
  const isTyping = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildPayload = useCallback(
    () => (threadId ? { scopeId, scopeType, threadId } : { scopeId, scopeType }),
    [scopeType, scopeId, threadId],
  );

  const stop = useCallback(() => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
    if (!isTyping.current) return;
    isTyping.current = false;
    void emitWithAck(SocketEvent.TYPING_STOP, buildPayload());
  }, [buildPayload]);

  const onChangeText = useCallback(() => {
    const now = Date.now();
    if (!isTyping.current || now - lastStartAt.current >= START_THROTTLE_MS) {
      lastStartAt.current = now;
      isTyping.current = true;
      void emitWithAck(SocketEvent.TYPING_START, buildPayload());
    }

    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(stop, STOP_AFTER_IDLE_MS);
  }, [buildPayload, stop]);

  // Rời màn hình (unmount) mà chưa `stop()` chủ động (vd điều hướng trong lúc còn gõ dở) ⇒ dừng hộ.
  useEffect(() => stop, [stop]);

  return { onChangeText, stop };
}
