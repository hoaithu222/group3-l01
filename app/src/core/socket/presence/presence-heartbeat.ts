import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';

import { socket } from '../socket.client';
import { SocketEvent } from '../socket.events';
import { usePresenceStore } from './presence.store';
import type { PresenceState } from './presence.store';

const HEARTBEAT_INTERVAL_MS = 30_000;
const TOUCH_THROTTLE_MS = 60_000;
/** Không có hoạt động (foreground-enter/chạm) quá mốc này ⇒ tick kế tiếp gửi `{active:false}`. */
const IDLE_AFTER_MS = 5 * 60_000;

interface PresenceUpdatedPayload {
  serverNow?: number;
  state: PresenceState;
  userId: string;
  v?: number;
}

function sendHeartbeat(active: boolean): void {
  if (!socket.connected) return;
  socket.emit(SocketEvent.PRESENCE_HEARTBEAT, { active });
}

/**
 * Vòng heartbeat presence + nhận `presence:updated` — gọi ĐÚNG MỘT LẦN lúc
 * khởi động (`AppProviders`), nhớ gọi `unbind()` lúc unmount.
 *
 * ── Vì sao KHÔNG cần một idle-timer riêng ────────────────────────────────────
 * Mỗi tick 30s tự tính `active` bằng khoảng cách tới lần hoạt động GẦN NHẤT
 * (`lastActivityAt`) thay vì giữ một trạng thái boolean rời rạc — quá 5 phút
 * không chạm thì đúng cái tick kế tiếp tự gửi `false`, không cần một
 * `setTimeout` song song dễ lệch pha với interval.
 */
export function bindPresenceHeartbeat(): { touch: () => void; unbind: () => void } {
  let lastActivityAt = Date.now();
  let lastTouchSentAt = 0;
  let intervalTimer: ReturnType<typeof setInterval> | null = null;

  const isActive = () => Date.now() - lastActivityAt < IDLE_AFTER_MS;

  const startForeground = () => {
    lastActivityAt = Date.now();
    sendHeartbeat(true);
    intervalTimer ??= setInterval(() => sendHeartbeat(isActive()), HEARTBEAT_INTERVAL_MS);
  };

  const stopForeground = () => {
    if (intervalTimer) {
      clearInterval(intervalTimer);
      intervalTimer = null;
    }
  };

  const onAppStateChange = (state: AppStateStatus) => {
    if (state === 'active') startForeground();
    else stopForeground();
  };

  const onPresenceUpdated = (payload: PresenceUpdatedPayload) => {
    usePresenceStore
      .getState()
      .set(payload.userId, { state: payload.state, updatedAt: payload.serverNow ?? Date.now() });
  };

  const appStateSub = AppState.addEventListener('change', onAppStateChange);
  socket.on(SocketEvent.PRESENCE_UPDATED, onPresenceUpdated);
  // Bind luôn coi là "đang ở foreground": nơi gọi DUY NHẤT (`AppProviders`) chỉ
  // gọi hàm này SAU khi phiên đã `authenticated` và cây provider đã dựng — tức
  // là app đang thật sự mở. ⛔ KHÔNG dựa vào `AppState.currentState` ở đây: nó
  // đọc từ module native (`NativeAppState.getConstants().initialAppState`) và
  // trong môi trường Jest giá trị đó không đảm bảo là `'active'`.
  startForeground();

  /** Chạm/cuộn — throttle 60s, và LUÔN cập nhật mốc hoạt động kể cả khi bị throttle. */
  const touch = () => {
    const now = Date.now();
    lastActivityAt = now;
    if (now - lastTouchSentAt < TOUCH_THROTTLE_MS) return;
    lastTouchSentAt = now;
    sendHeartbeat(true);
  };

  const unbind = () => {
    appStateSub.remove();
    socket.off(SocketEvent.PRESENCE_UPDATED, onPresenceUpdated);
    stopForeground();
  };

  return { touch, unbind };
}
