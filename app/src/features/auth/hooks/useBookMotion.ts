import { useEffect, useRef } from 'react';
import {
  cancelAnimation,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { MOTION_DURATION, MOTION_EASING, REVEAL_STAGGER_MS } from '@/shared/ui/motion';

/**
 * Chờ tiêu đề bắt đầu hiện (`Reveal` lệch từng 50ms) rồi mới mở: mở ngay khung hình đầu thì mắt chưa kịp thấy quyển
 * sách GẬP — mất nửa câu chuyện "mở sách ra là thấy các phân hệ".
 */
const OPEN_DELAY_MS = REVEAL_STAGGER_MS * 4;
/** Lần MỞ ĐẦU: cảnh diễn (`slow`), đi vào kiểu "nhanh rồi đậu thật êm". */
const FIRST_OPEN = { duration: MOTION_DURATION.slow, easing: MOTION_EASING.emphasizedDecelerate };
/**
 * Gập/mở theo ô mật khẩu: đổi trạng thái TẠI CHỖ ⇒ `standard`, dài cỡ vật thể lớn (`emphasized`) — xấp xỉ nhịp bàn phím
 * trồi lên/cụp xuống nên hai chuyển động đi cùng nhau thay vì đuổi nhau.
 */
const TOGGLE = { duration: MOTION_DURATION.emphasized, easing: MOTION_EASING.standard };
/** Lắc: trái → phải → nửa trái → nửa phải → về giữa; tổng đúng `MOTION_DURATION.base`. */
const SHAKE_PATTERN = [-1, 1, -0.5, 0.5, 0] as const;
const SHAKE_STEP = {
  duration: MOTION_DURATION.base / SHAKE_PATTERN.length,
  easing: MOTION_EASING.standard,
};

export interface BookMotionOptions {
  /** Gập sách (0) thay vì mở (1). */
  closed: boolean;
  /** Form đang báo lỗi — sườn lên `false → true` lắc MỘT lần. */
  hasError: boolean;
  /** Biên độ lắc (dp) — theo cỡ sách. */
  shakeDistance: number;
}

export interface BookMotion {
  /** Đích THẬT của sách (đã tính "Giảm chuyển động") — `AuthHero` phản chiếu ra `accessibilityState.expanded`. */
  open: boolean;
  /** 0 = gập · 1 = mở phẳng. MỘT giá trị dẫn MỌI lớp (bìa, các tờ, độ dời giữ giữa) — xem `book-geometry.ts`. */
  progress: SharedValue<number>;
  /** Độ lệch ngang (dp) của cả quyển khi lắc báo lỗi. */
  shake: SharedValue<number>;
}

/**
 * Nhịp chuyển động của quyển sách `AuthHero` — chạy hết trên luồng UI (Reanimated), React chỉ đổi ĐÍCH.
 *
 * ── "Giảm chuyển động" ──────────────────────────────────────────────────────────────────────────────────────────────
 * ⛔ Bật ⇒ sách vẽ MỞ ngay từ khung hình đầu và ĐỨNG YÊN: không mở dần, BỎ QUA cờ gập của ô mật khẩu, không lắc. Gập "tức
 * thì" (không hoạt ảnh) vẫn là cả mảng 200×144 đổi hình đột ngột mỗi lần chạm ô — đúng thứ người bật tuỳ chọn muốn tránh.
 * Chuyển động ở đây chỉ trang trí: dải `Alert` mới là thứ báo lỗi, ô mật khẩu vẫn che ký tự như thường.
 *
 * ── Vì sao KHÔNG có "lơ lửng" (translateY lặp vô hạn) ──────────────────────────────────────────────────────────────
 * Một `withRepeat(-1)` bắt Reanimated cập nhật MỖI khung hình suốt lúc người dùng gõ email/mật khẩu — tám lớp xoay 3D phải
 * ghép lại liên tục trên máy Android yếu, đổi lấy 2dp trang trí. Quyển sách đã "sống" nhờ gập/mở theo form.
 */
export function useBookMotion({ closed, hasError, shakeDistance }: BookMotionOptions): BookMotion {
  const reduceMotion = useReducedMotion();
  const open = reduceMotion || !closed;
  const target = open ? 1 : 0;
  // Không giảm chuyển động ⇒ khung đầu vẽ GẬP (0) rồi mới mở — mở sẵn thì mất nửa câu chuyện.
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  const shake = useSharedValue(0);
  const opened = useRef(false);
  const hadError = useRef(false);

  useEffect(() => {
    if (reduceMotion) {
      progress.set(target);
    } else if (opened.current) {
      // Đổi đích giữa chừng thì chạy tiếp TỪ CHỖ ĐANG ĐỨNG (không nhảy): `withTiming` luôn xuất phát từ giá trị hiện tại.
      progress.set(withTiming(target, TOGGLE));
    } else {
      progress.set(withDelay(OPEN_DELAY_MS, withTiming(target, FIRST_OPEN)));
    }
    opened.current = true;
    return () => cancelAnimation(progress);
  }, [progress, reduceMotion, target]);

  useEffect(() => {
    // Chỉ SƯỜN LÊN: lỗi vẫn đứng yên trên màn (người dùng chưa sửa) thì không lắc lại ở mỗi lần vẽ.
    const rising = hasError && !hadError.current;
    hadError.current = hasError;
    if (!rising || reduceMotion) return;
    shake.set(
      withSequence(...SHAKE_PATTERN.map((step) => withTiming(step * shakeDistance, SHAKE_STEP))),
    );
  }, [hasError, reduceMotion, shake, shakeDistance]);

  // ⚠️ Huỷ lắc CHỈ khi tháo khỏi cây: huỷ theo `hasError` thì lỗi tắt giữa nhịp lắc là sách kẹt lệch vài dp.
  useEffect(() => () => cancelAnimation(shake), [shake]);

  return { open, progress, shake };
}
