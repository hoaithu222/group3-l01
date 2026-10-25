import { useEffect, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { countUpValue } from '../utils/mock-score-utils';

/** Đủ dài để mắt thấy con số chạy, đủ ngắn để không bắt người học chờ mới đọc được điểm. */
const COUNT_UP_MS = 900;

/**
 * Điểm "chạy lên" từ 0 tới `target` khi màn kết quả mở (app.md p4-02 §7). Giảm chuyển động của hệ điều hành BẬT ⇒
 * KHÔNG chạy, trả thẳng `target`.
 *
 * ⚠️ Chỉ để TRANG TRÍ: nhãn trợ năng của nơi dùng phải đọc `target` thật, không đọc số đang chạy (trình đọc màn hình sẽ
 * xướng cả chục số trung gian). `setState` chỉ gọi trong callback của `requestAnimationFrame` (không đồng bộ trong
 * effect), và khung đang chờ được huỷ khi `target` đổi/unmount. Giá trị cuối LUÔN là `target` nguyên văn (kể cả số lẻ
 * 66,7) — các bước trung gian mới làm tròn.
 */
export function useScoreCountUp(target: number): number {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const startedAt = Date.now();
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - startedAt) / COUNT_UP_MS);
      setShown(countUpValue(t, target));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion, target]);

  return reduceMotion ? target : shown;
}
