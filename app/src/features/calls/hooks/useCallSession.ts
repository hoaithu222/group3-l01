import { useEffect } from 'react';

import { callsService } from '../api/calls.service';
import { useCallStore } from '../store/call.store';
import { useCallSurfaceStore, type CallSurface } from '../store/call-surface.store';
import { voiceJoinPrefs } from '../voice-room/store/voice-join.prefs';
import { connectCallSession, teardownCallSession } from './call-session.controller';

/**
 * `callId` đang có phiên media — ở TẦM MODULE, cố ý KHÔNG phải `useRef`.
 *
 * Từ p2-02 có HAI cây React trong cùng một JS runtime (root `main` và root `IncomingCall` của
 * màn khoá). Với `useRef`, mỗi cây giữ một bản đếm riêng: màn khoá nối media rồi bị đóng, cây
 * `main` không biết là đã có phiên nào — cuộc gọi kết thúc mà KHÔNG ai `teardown`, mic/camera
 * sống tiếp vô thời hạn. Một biến chung thì cây nào thấy `ended` trước cũng dọn được, và cây
 * còn lại thoát sớm (JS đơn luồng nên không có race).
 */
let connectedCallId: string | null = null;

/**
 * Nối/ngắt MEDIA theo pha của cuộc gọi. Mount MỘT lần mỗi cây React — media sống độc lập màn cuộc gọi.
 *
 *  · `outgoing`/`connecting` + có token ⇒ kết nối MỘT lần cho mỗi `callId` (người gọi vào phòng NGAY khi đang đổ chuông,
 *    người nghe vào sau khi `answer` trả token);
 *  · `ended`/`idle` ⇒ ngắt, dừng mọi track. Lý do `CONNECT_FAILED`: báo BE mình rời (best-effort) để cuộc gọi không treo.
 *
 * `surface` = cây React đang gọi hook. ⛔ Chỉ CHỦ SỞ HỮU (`call-surface.store.ts`) được nối:
 * hai cây cùng `connect()` là hai kết nối LiveKit cùng `identity` ⇒ server đá một cái ra.
 */
export function useCallSession(surface: CallSurface = 'main'): void {
  const owner = useCallSurfaceStore((state) => state.owner);
  const phase = useCallStore((state) => state.phase);
  const callId = useCallStore((state) => state.callId);
  const token = useCallStore((state) => state.token);
  const mediaKind = useCallStore((state) => state.call?.mediaKind ?? state.incoming?.mediaKind ?? 'AUDIO');
  const isRoom = useCallStore((state) => state.call?.mode === 'ROOM');
  const endReason = useCallStore((state) => state.endedInfo?.reason);

  useEffect(() => {
    if (owner !== surface) return;
    if (!callId || !token) return;
    if (phase !== 'outgoing' && phase !== 'connecting') return;
    if (connectedCallId === callId) return;
    connectedCallId = callId;
    // Phòng thoại kênh: lấy lựa chọn "để nghe"/camera người dùng vừa chọn (dùng MỘT lần); cuộc gọi RING không có.
    void connectCallSession(callId, token, mediaKind, isRoom ? voiceJoinPrefs.take() : undefined);
  }, [phase, callId, token, mediaKind, isRoom, owner, surface]);

  useEffect(() => {
    if (phase !== 'ended' && phase !== 'idle') return;
    if (connectedCallId === null) return;
    const leftCallId = connectedCallId;
    connectedCallId = null;
    void teardownCallSession();
    if (endReason === 'CONNECT_FAILED') void callsService.leave(leftCallId).catch(() => undefined);
  }, [phase, endReason]);
}
