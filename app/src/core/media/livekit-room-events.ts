import type * as LiveKitSdk from 'livekit-client';

import { reasonOf } from './livekit-participants';
import type { CallMediaDisconnectReason } from './call-media.types';

/** Móc của adapter vào sự kiện phòng — tách khỏi `livekit-call-media.ts` để mỗi file ≤ 150 dòng. */
export interface RoomEventHooks {
  /** Còn là phòng HIỆN TẠI của adapter? `false` = ngắt do CHÍNH mình gọi `disconnect()` — không báo lại như sự cố. */
  isCurrent: () => boolean;
  onDisconnected: (reason: CallMediaDisconnectReason) => void;
  onReconnected: () => void;
  onReconnecting: () => void;
  /** Người/track/mic/camera/người nói đổi ⇒ dựng lại snapshot. */
  refresh: () => void;
}

/** Đăng ký sự kiện `Room`. Không `removeAllListeners` — phòng bị bỏ sau `disconnect()`, listener chết theo phòng. */
export function bindRoomEvents(room: LiveKitSdk.Room, RoomEvent: typeof LiveKitSdk.RoomEvent, hooks: RoomEventHooks): void {
  room
    .on(RoomEvent.Reconnecting, hooks.onReconnecting)
    .on(RoomEvent.Reconnected, hooks.onReconnected)
    .on(RoomEvent.Disconnected, (reason) => {
      if (hooks.isCurrent()) hooks.onDisconnected(reasonOf(reason));
    })
    .on(RoomEvent.ParticipantConnected, hooks.refresh)
    .on(RoomEvent.ParticipantDisconnected, hooks.refresh)
    .on(RoomEvent.TrackSubscribed, hooks.refresh)
    .on(RoomEvent.TrackUnsubscribed, hooks.refresh)
    .on(RoomEvent.TrackMuted, hooks.refresh)
    .on(RoomEvent.TrackUnmuted, hooks.refresh)
    .on(RoomEvent.LocalTrackPublished, hooks.refresh)
    .on(RoomEvent.LocalTrackUnpublished, hooks.refresh)
    .on(RoomEvent.ActiveSpeakersChanged, hooks.refresh);
}
