import type * as LiveKitSdk from 'livekit-client';

import { reasonOf } from '@/core/media/livekit-participants';
import type { CallMediaDisconnectReason } from '@/core/media/call-media.types';

import { REACTION_TOPIC } from './livekit-meeting-snapshot';

/** Móc của adapter vào sự kiện phòng — tách khỏi `livekit-meeting-media.ts` để mỗi file ≤ 150 dòng. */
export interface MeetingRoomHooks {
  /** Còn là phòng HIỆN TẠI của adapter? `false` = ngắt do CHÍNH mình gọi `disconnect()` — không báo lại như sự cố. */
  isCurrent: () => boolean;
  onDisconnected: (reason: CallMediaDisconnectReason) => void;
  onReaction: (identity: string, payload: Uint8Array) => void;
  onReconnected: () => void;
  onReconnecting: () => void;
  /** Track mới xuất hiện ⇒ áp lại danh sách video được subscribe (track mới mặc định được nhận hết). */
  onTrackPublished: () => void;
  /** Track/mic/camera/người nói/giơ tay/tên/chất lượng mạng đổi ⇒ HẸN dựng lại snapshot (gộp nhiều sự kiện thành một lần — `SnapshotPump`). */
  refresh: () => void;
  /** Người vào/ra phòng ⇒ dựng lại NGAY (ô xuất hiện/biến mất không được trễ). */
  refreshNow: () => void;
}

type Events = LiveKitSdk.RoomEventCallbacks;

/**
 * Đăng ký sự kiện `Room`; trả hàm gỡ ĐÚNG những listener đã gắn (⛔ không `removeAllListeners` — bài học Sun). Adapter gỡ ngay khi bỏ phòng
 * (`disconnect`/nối phòng mới), nên một `Room` cũ đang tự dọn không bắn sự kiện muộn vào adapter, và nối lại nhiều lần không bị gắn chồng.
 * Mọi handler còn qua cổng `isCurrent()` cho phần sự kiện bắn ra giữa lúc bỏ phòng và lúc gỡ.
 */
export function bindMeetingRoomEvents(room: LiveKitSdk.Room, RoomEvent: typeof LiveKitSdk.RoomEvent, hooks: MeetingRoomHooks): () => void {
  const offs: (() => void)[] = [];
  const on = <E extends keyof Events>(event: E, listener: Events[E]): void => {
    room.on(event, listener);
    offs.push(() => void room.off(event, listener));
  };
  const live =
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A): void => {
      if (hooks.isCurrent()) fn(...args);
    };
  const joinedOrLeft = live(() => {
    hooks.onTrackPublished();
    hooks.refreshNow();
  });

  on(RoomEvent.Reconnecting, live(hooks.onReconnecting));
  on(RoomEvent.Reconnected, live(hooks.onReconnected));
  on(
    RoomEvent.Disconnected,
    live((reason?: LiveKitSdk.DisconnectReason) => hooks.onDisconnected(reasonOf(reason))),
  );
  on(RoomEvent.ParticipantConnected, joinedOrLeft);
  on(RoomEvent.ParticipantDisconnected, live(hooks.refreshNow));
  on(RoomEvent.TrackPublished, live(hooks.onTrackPublished));
  for (const event of [
    RoomEvent.TrackSubscribed,
    RoomEvent.TrackUnsubscribed,
    RoomEvent.TrackMuted,
    RoomEvent.TrackUnmuted,
    RoomEvent.LocalTrackPublished,
    RoomEvent.LocalTrackUnpublished,
    RoomEvent.ActiveSpeakersChanged,
    RoomEvent.ParticipantAttributesChanged,
    RoomEvent.ParticipantNameChanged,
    RoomEvent.ConnectionQualityChanged,
  ] as const) {
    on(event, live(hooks.refresh));
  }
  on(
    RoomEvent.DataReceived,
    live((payload: Uint8Array, participant?: LiveKitSdk.RemoteParticipant, _kind?: unknown, topic?: string) => {
      if (topic === REACTION_TOPIC && participant) hooks.onReaction(participant.identity, payload);
    }),
  );
  return () => offs.splice(0).forEach((off) => off());
}
