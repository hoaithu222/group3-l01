import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

/**
 * Đưa một số 0..1 (tiến độ) chạy dần từ giá trị đang hiện tới `target` — để vòng tiến độ "quét" một lần lúc thẻ xuất hiện và trượt
 * mượt khi số đổi (vừa ôn xong một phiên quay lại). `ProgressRing` của bộ chung vẽ thẳng giá trị nhận được, không tự chạy.
 *
 * ⛔ "Giảm chuyển động" của hệ điều hành BẬT ⇒ nhảy thẳng tới đích, không có khung trung gian (cùng luật với `AnimatedNumber` của `@/shared/ui/motion`).
 * ⚠️ Chỉ để TRANG TRÍ: nhãn trợ năng của vòng phải đọc số THẬT (đích), không đọc số đang chạy — trình đọc màn hình sẽ xướng cả chục
 * giá trị trung gian. `setState` chỉ gọi trong callback `requestAnimationFrame` (không đồng bộ trong effect) và khung đang chờ được
 * dọn khi `target` đổi/gỡ khỏi cây, nên không có cập nhật sau khi tháo. Ease-out: nhanh lúc đầu, chậm dần về đúng số — khoảnh khắc
 * cuối là cái mắt dừng lại đọc.
 */
export function useSweep(target: number, durationMs = 650): number {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(0);
  const current = useRef(0);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const from = current.current;
    if (from === target) return undefined;
    const startedAt = Date.now();
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - startedAt) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      current.current = t >= 1 ? target : from + (target - from) * eased;
      setShown(current.current);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [durationMs, reduceMotion, target]);

  return reduceMotion ? target : shown;
}
