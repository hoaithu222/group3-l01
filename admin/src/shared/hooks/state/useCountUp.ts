/**
 * useCountUp — chạy một con số từ giá trị CŨ tới giá trị MỚI bằng `requestAnimationFrame`.
 *
 * Đây là phần "sống" của các thẻ số liệu kiểu bảng điều khiển lớn (DataV gọi là
 * *digital flop*): con số không nhảy phịch một cái, nó chạy tới — nhờ vậy mắt
 * BẮT ĐƯỢC là số vừa đổi, kể cả khi đang nhìn chỗ khác trên màn hình.
 *
 * ── Ba quyết định đáng biết ────────────────────────────────────────────────
 *
 * 1. **Lần đầu chạy từ 0, các lần sau chạy từ giá trị TRƯỚC.**
 *    Luôn chạy từ 0 thì mỗi lần polling trả về `1.235` rồi `1.236`, con số lại
 *    rơi về 0 và bò lên — đọc ra như dữ liệu vừa mất rồi có lại. Chạy từ giá
 *    trị trước cho ra một bước nhích đúng bằng phần đã thay đổi.
 *
 * 2. **`prefers-reduced-motion` ⇒ NHẢY THẲNG tới đích, không phải chạy nhanh
 *    hơn.** Với người bị rối loạn tiền đình, chuyển động không mong muốn gây
 *    chóng mặt thật; rút ngắn thời lượng không giải quyết được gì.
 *
 * 3. **Không dùng `setInterval`.** rAF tự dừng khi tab ẩn, nên bảng điều khiển
 *    mở nền cả ngày không đốt CPU. `setInterval` vẫn chạy và vẫn setState.
 *
 * ⛔ Hook trả về SỐ ĐANG CHẠY, không phải số đích. Đừng dùng nó làm nguồn cho
 *    tính toán hay so sánh — chỉ để HIỂN THỊ.
 */

import { useEffect, useRef, useState } from 'react';

import { usePrefersReducedMotion } from '../dom/useMediaQuery';

export interface UseCountUpOptions {
  /** Thời lượng chạy (ms). Mặc định 900. */
  duration?: number;
  /**
   * Tắt hẳn hiệu ứng — trả thẳng `target`.
   *
   * Dùng khi con số nằm trong bảng dài hoặc trong ô đang sửa: ở đó chuyển động
   * là nhiễu, không phải tín hiệu.
   */
  disabled?: boolean;
}

/**
 * `easeOutCubic` — nhanh lúc đầu, chậm dần về cuối.
 *
 * Chọn đúng đường cong này (cũng là mặc định của DataV) vì nó dành phần lớn
 * thời gian ở GẦN giá trị cuối: người đọc thấy ngay con số cỡ bao nhiêu, phần
 * đuôi chỉ là chốt lại chữ số cuối. Đường cong tuyến tính thì nửa thời lượng
 * đầu con số còn sai một nửa — vô ích mà lại lâu.
 */
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export function useCountUp(target: number, options: UseCountUpOptions = {}): number {
  const { duration = 900, disabled = false } = options;
  const reducedMotion = usePrefersReducedMotion();
  const skip = disabled || reducedMotion || !Number.isFinite(target);

  const [display, setDisplay] = useState(() => (skip ? target : 0));

  /**
   * Bản sao của giá trị đang hiện, để rAF đọc mà không cần `display` trong deps.
   *
   * ⛔ Ref này chỉ được ghi TRONG effect / TRONG rAF, KHÔNG ghi lúc render.
   *    Ghi ref lúc render làm hàm render hết thuần: ở chế độ đồng thời React
   *    được phép render rồi VỨT BỎ kết quả, và lần render bị vứt đó đã kịp
   *    đổi ref — animation sau sẽ xuất phát từ một giá trị chưa từng hiện lên
   *    màn hình. `react-hooks/refs` chặn đúng chuyện này.
   */
  const displayRef = useRef(display);

  useEffect(() => {
    if (skip) {
      displayRef.current = target;
      setDisplay(target);
      return;
    }

    const from = displayRef.current;
    if (from === target) return;

    let frame = 0;
    let start: number | null = null;

    const step = (now: number) => {
      start ??= now;
      const progress = Math.min(1, (now - start) / duration);
      // Khung hình CUỐI gán đúng `target`, không phải kết quả nội suy: sai số
      // dấu phẩy động của phép nhân sẽ để lại "1.234,999…" đứng vĩnh viễn.
      const next = progress === 1 ? target : from + (target - from) * easeOutCubic(progress);
      displayRef.current = next;
      setDisplay(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, skip]);

  return display;
}
