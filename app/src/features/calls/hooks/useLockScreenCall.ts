import { useEffect, useState } from 'react';

import { connectSocket } from '@/core/socket';
import { restoreSession } from '@/shell/session/restore-session';
import { useAuthStore } from '@/shell/store/slices/auth';

import { callsService } from '../api/calls.service';
import {
  closeLockScreenCallScreen,
  dismissLockScreenCall,
  getLockScreenLaunchCall,
  onLockScreenCallSignal,
  setLockScreenCallHold,
  stopLockScreenRinging,
} from '../native/lock-screen-call';
import { callSurfaceApi } from '../store/call-surface.store';
import { callStoreApi, useCallStore } from '../store/call.store';

/**
 * `preparing` — đang khôi phục phiên / hỏi BE. `ready` — có cuộc gọi để vẽ. `gone` — hết việc,
 * màn sắp đóng.
 */
export type LockScreenStage = 'gone' | 'preparing' | 'ready';

/** Tín hiệu native "thôi reo" → lý do kết thúc phía client. */
const END_REASON: Readonly<Record<string, 'ANSWERED_ELSEWHERE' | 'CANCELLED' | 'NO_ANSWER'>> = {
  'call.answered-elsewhere': 'ANSWERED_ELSEWHERE',
  'call.cancelled': 'CANCELLED',
  'call.missed': 'NO_ANSWER',
};

/**
 * Bộ điều phối của root `IncomingCall` (màn gọi bung trên MÀN KHOÁ, `IncomingCallActivity`).
 *
 * Nó có thể là JS DUY NHẤT đang sống — app bị vuốt tắt, hệ thống đánh thức tiến trình chỉ để
 * dựng Activity này. Nên nó phải tự lo đủ bốn việc mà cây `main` vẫn làm hộ: khôi phục phiên,
 * nối socket, dựng `callStore` từ `callId` của thông báo, và đóng màn khi cuộc gọi tàn.
 *
 * ⛔ Phân biệt HAI cách đóng:
 *  · `dismissLockScreenCall` — cuộc gọi ĐÃ TÀN: hạ luôn chuông trên khay;
 *  · `closeLockScreenCallScreen` — chỉ là "tôi không dựng lại được UI" (mất mạng, phiên chết):
 *    GIỮ thông báo lại để người dùng vẫn còn nút Nghe/Từ chối trên khay.
 */
export function useLockScreenCall(): LockScreenStage {
  const [stage, setStage] = useState<LockScreenStage>('preparing');
  const phase = useCallStore((state) => state.phase);
  const callId = useCallStore((state) => state.callId);

  // Giành quyền sở hữu phiên media: cây `main` (nếu đang sống) phải NHƯỜNG, nếu không hai
  // kết nối LiveKit cùng `identity` và server đá một cái ra.
  useEffect(() => {
    callSurfaceApi.claim('lockscreen');
    return () => callSurfaceApi.release('lockscreen');
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const launch = await getLockScreenLaunchCall();
      if (cancelled) return;
      if (!launch) {
        // Activity mở suông (không có extras) — không có gì để vẽ.
        closeLockScreenCallScreen();
        setStage('gone');
        return;
      }

      // Access token KHÔNG được persist (xem `auth.config.ts`): mở nguội thì phải đổi refresh
      // token lấy token mới trước, nếu không mọi lời gọi REST dưới đây đều 401.
      // `refreshSession()` là single-flight ở tầm module nên gọi song song với cây `main` an toàn.
      if (useAuthStore.getState().status !== 'authenticated') await restoreSession();
      if (cancelled) return;
      if (useAuthStore.getState().status !== 'authenticated') {
        closeLockScreenCallScreen(); // phiên chết/mất sóng — giữ chuông, đừng nuốt cuộc gọi
        setStage('gone');
        return;
      }

      // Socket là nguồn tín hiệu NHANH nhất cho `call:accepted/ended/cancelled`; native chỉ bắc
      // cầu cho các gói FCM. Nối ở đây vì root này không có `AppProviders`.
      connectSocket();

      try {
        const call = await callsService.get(launch.callId);
        if (cancelled) return;
        callStoreApi.dispatch({ call, type: 'SYNC' });
        // `SYNC` tự suy pha: còn trả lời được ⇒ `incoming`; đã kết thúc ⇒ `ended`/`idle`.
        setStage(callStoreApi.get().phase === 'idle' ? 'gone' : 'ready');
      } catch {
        if (!cancelled) {
          closeLockScreenCallScreen(); // lỗi mạng ≠ cuộc gọi đã tàn — giữ thông báo lại
          setStage('gone');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Cầu tín hiệu native → JS. Cần vì gói FCM `call.cancelled` tới receiver chứ không tới root
   * này, và socket có thể chưa kịp nối xong khi người gọi đã huỷ.
   */
  useEffect(() => {
    const subscription = onLockScreenCallSignal(({ callId: signalId, type }) => {
      const current = callStoreApi.get().callId;
      if (current && signalId && current !== signalId) return;
      const reason = END_REASON[type];
      if (reason) callStoreApi.dispatch({ reason, type: 'LOCAL_ENDED' });
    });
    return () => subscription?.remove();
  }, []);

  /**
   * Nhận cuộc NGAY TRÊN MÀN KHOÁ ⇒ tắt chuông nhưng GIỮ màn (⛔ không `dismiss`: nó đóng luôn
   * Activity), và bật `holdActive` — push `call.answered-elsewhere` ngay sau là ECHO của máy này.
   */
  useEffect(() => {
    const live = phase === 'connecting' || phase === 'active';
    if (!live) return;
    stopLockScreenRinging(callId);
    setLockScreenCallHold(true);
  }, [phase, callId]);

  /**
   * Cuộc gọi tàn hẳn ⇒ hạ chuông + đóng Activity. ⛔ KHÔNG `setStage` ở đây (setState đồng bộ
   * trong effect): trạng thái đó SUY RA được ở `return` cuối hàm.
   */
  useEffect(() => {
    if (stage !== 'ready' || phase !== 'idle') return;
    dismissLockScreenCall(callId);
  }, [stage, phase, callId]);

  /** Unmount mà vẫn đang đổ chuông ⇒ `RESET`: đừng để lại cuộc gọi ma cho cây `main` nhặt phải. */
  useEffect(
    () => () => {
      if (callStoreApi.get().phase === 'incoming') callStoreApi.dispatch({ type: 'RESET' });
    },
    [],
  );

  // `idle` sau khi đã dựng xong = cuộc gọi hết — không còn gì để vẽ, Activity đang đóng.
  return stage === 'ready' && phase === 'idle' ? 'gone' : stage;
}
