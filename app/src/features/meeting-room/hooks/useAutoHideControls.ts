import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, type GestureResponderEvent } from 'react-native';

export const CONTROLS_HIDE_AFTER_MS = 5000;
/** Một cú "gõ" (tap): nhấc tay trong ngần này ms — lâu hơn là nhấn giữ (ghim ô người). */
const TAP_MAX_MS = 300;
/** …và không trượt quá ngần này dp — trượt là vuốt trang lưới / kéo nội dung đã phóng, không phải gõ. */
const TAP_SLOP_DP = 10;

/** Sự kiện chạm THÔ gắn lên khung sân khấu (`View`): nhận mọi cú chạm của cây con, kể cả khi ô người con đã giữ quyền nhận chạm. */
export interface StageTouchHandlers {
  onTouchCancel: () => void;
  onTouchEnd: (event: GestureResponderEvent) => void;
  onTouchStart: (event: GestureResponderEvent) => void;
}

export interface AutoHideControls {
  /** Tiêu đề + thanh điều khiển đang ẩn (mờ đi, KHÔNG gỡ khỏi bố cục — xem `RoomChromeSlot`). */
  hidden: boolean;
  /** Chạm bất kỳ đâu trong phòng: đang ẩn ⇒ hiện lại; đang hiện ⇒ đếm lại 5 giây (khi đang xem chia sẻ). */
  reveal: () => void;
  /** Gắn lên khung sân khấu: gõ một cái lên sân khấu khi thanh đang hiện ⇒ ẩn (chỉ khi `tapToHide`). */
  stageTouch: StageTouchHandlers;
}

interface TouchStart {
  at: number;
  /** Cú chạm này bắt đầu lúc thanh đang ẩn ⇒ nó là cú "chạm để hiện", nhấc tay ra không được ẩn lại ngay. */
  wasHidden: boolean;
  x: number;
  y: number;
}

/**
 * Ẩn/hiện tiêu đề + thanh điều khiển của phòng họp:
 *  · tự ẩn sau 5 giây không chạm KHI đang xem chia sẻ màn hình (`active`, app.md §7); chạm bất kỳ đâu để hiện (`reveal`);
 *  · `tapToHide` (Meet): gõ một cái lên sân khấu thì ẩn, gõ lần nữa thì hiện. Cha tắt nó khi có chia sẻ (chạm nội dung chia sẻ đã là
 *    "toàn màn hình" của `ScreenShareSpotlight`) và khi chỉ có mình trong phòng (nút "Mời người khác" nằm trên sân khấu).
 *
 * ⛔ Không bao giờ ẩn khi có sheet/hộp thoại mở (`blocked`) hoặc trình đọc màn hình (TalkBack/VoiceOver) đang bật — người dùng đó không
 * "chạm để hiện" được. Hai điều kiện đó còn XOÁ luôn lần ẩn trước: đóng sheet xong thanh vẫn hiện, không tự biến mất lại.
 * ⚠️ Nhận diện "gõ" bằng sự kiện chạm THÔ (thời gian + độ trượt), không bằng `Pressable`: ô người là `Pressable` (nhấn giữ để ghim) nên
 * giành quyền nhận chạm trước mọi lớp cha — một `Pressable` bọc sân khấu sẽ không bao giờ nhận được cú gõ rơi vào ô.
 */
export function useAutoHideControls(active: boolean, blocked: boolean, tapToHide = false): AutoHideControls {
  const [idle, setIdle] = useState(false);
  const [tappedHidden, setTappedHidden] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const [touchedAt, setTouchedAt] = useState(0);
  const start = useRef<TouchStart | null>(null);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (!cancelled) setScreenReader(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  const locked = blocked || screenReader;
  const timed = active && !locked;

  useEffect(() => {
    if (!timed) return undefined;
    const timer = setTimeout(() => setIdle(true), CONTROLS_HIDE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [timed, touchedAt]);

  // Bị khoá (sheet/hộp thoại/trình đọc màn hình) ⇒ QUÊN lần ẩn trước. Tính ngay lúc vẽ (mẫu "chỉnh state theo prop" của React) thay vì
  // `useEffect` + setState (vẽ hai lần, ESLint `set-state-in-effect` chặn).
  const [wasLocked, setWasLocked] = useState(locked);
  if (locked !== wasLocked) {
    setWasLocked(locked);
    if (locked) {
      setIdle(false);
      setTappedHidden(false);
    }
  }

  // `idle` chỉ có nghĩa khi điều kiện tự ẩn còn đúng — hết chia sẻ thì thanh hiện lại ngay, không cần chạm.
  const hidden = !locked && (tappedHidden || (idle && active));

  const reveal = useCallback(() => {
    setIdle(false);
    setTappedHidden(false);
    // Chỉ đếm lại khi đồng hồ tự ẩn đang chạy: đổi state ở MỖI cú chạm là vẽ lại cả phòng (mọi ô video) vô ích.
    if (timed) setTouchedAt(Date.now());
  }, [timed]);

  const onTouchStart = useCallback(
    (event: GestureResponderEvent) => {
      const { pageX, pageY, touches } = event.nativeEvent;
      // Ngón thứ hai chạm xuống (pinch) ⇒ không còn là cú gõ.
      start.current = touches.length > 1 ? null : { at: Date.now(), wasHidden: hidden, x: pageX, y: pageY };
    },
    [hidden],
  );

  const onTouchEnd = useCallback(
    (event: GestureResponderEvent) => {
      const begin = start.current;
      start.current = null;
      if (!begin || begin.wasHidden || !tapToHide || locked) return;
      const { pageX, pageY } = event.nativeEvent;
      const tap =
        Date.now() - begin.at <= TAP_MAX_MS && Math.abs(pageX - begin.x) <= TAP_SLOP_DP && Math.abs(pageY - begin.y) <= TAP_SLOP_DP;
      if (tap) setTappedHidden(true);
    },
    [locked, tapToHide],
  );

  // Danh sách cuộn ngang (vuốt trang) / cử chỉ phóng giành cú chạm ⇒ hệ thống huỷ chạm, không có `touchEnd`: quên điểm bắt đầu.
  const onTouchCancel = useCallback(() => {
    start.current = null;
  }, []);

  return { hidden, reveal, stageTouch: { onTouchCancel, onTouchEnd, onTouchStart } };
}
