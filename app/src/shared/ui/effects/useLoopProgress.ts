import { useEffect } from 'react';
import {
  cancelAnimation,
  Easing,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

export interface LoopProgressOptions {
  /** Có chạy không — `false` khi màn bị che (tab khác), khi nơi gọi tắt `animated`… */
  active: boolean;
  /** Chờ trước lượt ĐẦU (ms) — để hiệu ứng đi SAU nhịp hiện dần của màn (`Reveal`). */
  delay?: number;
  /** Thời lượng MỘT lượt 0 → 1 (ms) — lấy từ `MOTION_LOOP`. */
  duration: number;
  /** Chạy ĐÚNG MỘT lượt rồi đứng ở 1 (ánh quét lúc vào màn) thay vì lặp. */
  once?: boolean;
  /** Nghỉ ở cuối mỗi lượt (ms) rồi nhảy về 0 — ánh quét cần nghỉ; quầng trôi thì không. */
  rest?: number;
  /** Lượt sau chạy NGƯỢC (0 → 1 → 0…) với easing hình sin — cho chuyển động qua lại (trôi, thở). */
  reverse?: boolean;
  /** Giá trị đứng yên khi không chạy ("Giảm chuyển động", `active={false}`). Mặc định 0. */
  still?: number;
}

/**
 * Tiến độ 0 → 1 LẶP MÃI trên luồng UI — lõi chung của mọi hiệu ứng trang trí trong `effects/`.
 *
 * ⛔ Tôn trọng "Giảm chuyển động": bật ⇒ đứng yên ở `still`, không một khung hình nào chạy — hiệu ứng ở đây chỉ trang trí.
 * ⛔ HUỶ khi tháo khỏi cây hoặc khi `active` tắt: vòng lặp vô hạn quên huỷ là Reanimated chạy mãi trên luồng UI (tab đã
 * rời vẫn gắn trong cây) — và trong Jest là tiến trình không thoát được.
 * ⚠️ `withSequence(lượt, withDelay(nghỉ, nhảy về 0))`: nhảy về 0 lúc hiệu ứng đang nằm NGOÀI khung (ánh quét đã ra khỏi mép)
 * nên mắt không thấy cú nhảy.
 */
/**
 * ⚠️ Trong Jest KHÔNG chạy vòng lặp trang trí: Reanimated ở Jest đẩy từng khung hình bằng hẹn giờ ⇒ một `withRepeat(-1)`
 * gắn trong màn đang test là hẹn giờ nối đuôi mãi (test chậm, `runAllTimers` lặp vô tận, tiến trình không thoát). Test chỉ
 * kiểm HÀNH VI (`docs/rules/testing.md`) — cùng lý do `Skeleton`/`ProgressRing` có `animated={false}` cho test.
 * `process.env.NODE_ENV` là biến Metro/Babel THAY CHUỖI lúc dựng (không phải đọc động như `process.env[key]`).
 */
const IS_TEST_RUN = process.env.NODE_ENV === 'test';

export function useLoopProgress({
  active,
  delay = 0,
  duration,
  once = false,
  rest = 0,
  reverse = false,
  still = 0,
}: LoopProgressOptions): SharedValue<number> {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(still);
  const running = active && !reduceMotion && !IS_TEST_RUN;

  useEffect(() => {
    if (!running) {
      // ⛔ Huỷ TRƯỚC khi gán: vòng lặp cũ còn chạy thì ghi đè giá trị vừa gán.
      cancelAnimation(progress);
      progress.set(still);
      return undefined;
    }
    progress.set(0);
    const lap = withTiming(1, {
      duration,
      easing: reverse ? Easing.inOut(Easing.sin) : Easing.linear,
    });
    if (once) {
      progress.set(withDelay(delay, lap));
    } else {
      const cycle =
        rest > 0 ? withSequence(lap, withDelay(rest, withTiming(0, { duration: 0 }))) : lap;
      progress.set(withDelay(delay, withRepeat(cycle, -1, reverse && rest === 0)));
    }
    return () => cancelAnimation(progress);
  }, [delay, duration, once, progress, rest, reverse, running, still]);

  return progress;
}
