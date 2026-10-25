import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { callsService } from '../api/calls.service';
import { useCallSession } from '../hooks/useCallSession';
import { useCallSignals } from '../hooks/useCallSignals';
import { useCallForegroundService } from '../hooks/useCallForegroundService';
import { useCallKeepAwake } from '../hooks/useCallKeepAwake';
import { useIncomingRingtone } from '../hooks/useIncomingRingtone';
import {
  dismissLockScreenCall,
  setCallUiReady,
  setLockScreenCallHold,
} from '../native/lock-screen-call';
import { useHostActionsListener } from '../voice-room/hooks/useHostActionsListener';
import { useCallSurfaceStore } from '../store/call-surface.store';
import { callStoreApi, useCallStore } from '../store/call.store';

/** Thời gian màn "Cuộc gọi đã kết thúc" còn hiện trước khi về `idle` (README p2-01 §5.2). */
const ENDED_LINGER_MS = 2000;
/** Chờ thêm sau `expiresAt` trước khi hỏi lại BE (đồng hồ hai máy lệch nhẹ, tín hiệu hết giờ tới trễ vài giây). */
const STALE_RING_GRACE_MS = 5000;

/**
 * Bộ máy cuộc gọi — HEADLESS, mount MỘT lần ở `app/_layout.tsx` (gốc), KHÔNG phải ở `(app)`.
 *
 * ⛔ Vì sao ở GỐC chứ không ở `(app)/_layout.tsx` (sự cố 01/10/2026): route `call/[callId]` nằm
 * NGOÀI nhóm `(app)`, và root stack không khai `unstable_settings`/anchor. Mở app NGUỘI bằng deep
 * link từ thông báo cuộc gọi ⇒ Expo Router chỉ dựng đúng màn `call/[callId]`, `(app)/_layout.tsx`
 * KHÔNG hề mount. Khi đó không có `useCallSession` (media không bao giờ nối — người nhận kẹt ở
 * "Đang kết nối…" trong khi người gọi đã chạy đồng hồ), không có `useCallSignals` (không nhận
 * `call:*`), và không ai hạ chuông native (chuông + thông báo cuộc gọi đến treo mãi sau khi đã
 * bấm Nghe). Cả ba triệu chứng người dùng báo đều từ đúng một gốc này.
 *
 * Phần NHÌN THẤY ĐƯỢC (`MiniCallBar`) vẫn ở `(app)/_layout.tsx`: nó phải nằm ngay trên thanh tab.
 *
 * Việc của bộ máy này:
 *  · nối/ngắt media theo pha (`useCallSession`);
 *  · có cuộc gọi ĐẾN khi app đang mở ⇒ đẩy màn `call/[callId]` một lần cho mỗi cuộc gọi (cuộc đi/tham gia đã tự đẩy khi bấm);
 *  · `ended` ⇒ dọn về `idle` sau 2 giây;
 * Chuông khi app ở NỀN/máy khoá do native lo (`plugins/call-notification/CallPushReceiver.kt`,
 * p2-02); ở đây là phần foreground + ba cầu nối sang native bên dưới.
 */
export function CallRuntime(): null {
  /**
   * Socket `call:*` + đồng bộ `/me/active-call`. ⛔ Trước đây nằm ở `(app)/_layout.tsx` — xem khối
   * KDoc trên: đó chính là lý do cuộc gọi mở NGUỘI từ thông báo không bao giờ nối được media.
   */
  useCallSignals();
  useCallSession('main');
  /** Chuông khi app đang mở — native cố ý im ở ca này, xem hook. */
  useIncomingRingtone();
  /** Gọi VIDEO thì không để màn tự khoá giữa chừng — xem hook. */
  useCallKeepAwake();
  /** Giữ micro/camera sống khi ra nền giữa cuộc gọi — xem hook. */
  useCallForegroundService();
  /** p2-03: chủ phòng chặn mic/mời ra/đổi chủ — phải xử lý kể cả khi phòng đang THU NHỎ, nên mount ở đây chứ không ở màn phòng. */
  useHostActionsListener();
  const phase = useCallStore((state) => state.phase);
  const callId = useCallStore((state) => state.callId);
  const ringExpiresAt = useCallStore((state) => state.ringExpiresAt);
  const owner = useCallSurfaceStore((state) => state.owner);
  const presented = useRef<string | null>(null);

  /**
   * Cờ "app có đường hiện cuộc gọi" cho `CallPushReceiver` (p2-02) — bật suốt vòng đời bộ máy.
   *
   * ⛔ Phải tắt khi unmount: treo `true` lúc JS đã chết là receiver `return` sớm ở nhánh
   * app-đang-mở và im luôn cho MỌI cuộc gọi sau — mất chuông toàn tập, không một dấu vết.
   */
  useEffect(() => {
    setCallUiReady(true);
    return () => setCallUiReady(false);
  }, []);

  /**
   * Hạ chuông/thông báo native ngay khi cuộc gọi thôi đổ chuông (đã trả lời trong app, bên kia
   * huỷ, hết giờ) thay vì chờ gói FCM kế tiếp: tín hiệu socket tới NHANH hơn và vẫn tới cả khi
   * FCM bị hoãn — đó là lý do máy thứ hai từng còn reo sau khi máy kia đã bắt máy.
   *
   * `holdActive` bật từ lúc vào cuộc tới lúc kết thúc: push `call.answered-elsewhere` là ECHO
   * của chính máy này vừa bấm Nghe, không chặn thì native đóng luôn màn đang nói dở.
   */
  useEffect(() => {
    // ⛔ Màn khoá đang cầm cuộc gọi ⇒ cây này KHÔNG được đụng vào bề mặt native: `dismiss` sẽ
    // đóng đúng màn người dùng đang nói (cây `main` vẫn sống khi app chạy nền + máy khoá).
    if (owner !== 'main') return;
    // Hạ chuông TRƯỚC rồi mới bật `hold`: `dismiss` cũng nhả `holdActive`, làm ngược lại là tự xoá.
    if (phase !== 'incoming' && callId) dismissLockScreenCall(callId);
    setLockScreenCallHold(phase === 'connecting' || phase === 'active');
  }, [phase, callId, owner]);

  useEffect(() => {
    if (phase === 'incoming' && callId && presented.current !== callId) {
      presented.current = callId;
      router.push({ params: { callId }, pathname: '/call/[callId]' });
    }
  }, [phase, callId]);

  // Quá hạn đổ chuông + 5 s mà không có tín hiệu nào (mất socket/push) ⇒ hỏi BE, KHÔNG tự từ chối (README §5.3).
  useEffect(() => {
    if (phase !== 'incoming' || !callId || ringExpiresAt === null) return undefined;
    const timer = setTimeout(() => {
      void callsService
        .get(callId)
        .then((call) => callStoreApi.dispatch({ call, type: 'SYNC' }))
        .catch(() => undefined);
    }, Math.max(0, ringExpiresAt + STALE_RING_GRACE_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [phase, callId, ringExpiresAt]);

  useEffect(() => {
    if (phase !== 'ended') return undefined;
    const timer = setTimeout(() => callStoreApi.dispatch({ type: 'DISMISS' }), ENDED_LINGER_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  return null;
}
