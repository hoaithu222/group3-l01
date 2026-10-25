import { useEffect, useRef, useState } from 'react';
import { Text, type TextProps } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { formatNumber } from '@/shared/utils/format/currency.utils';

import { MOTION_DURATION } from './motion.tokens';

/** Chữ số cùng bề rộng: số đang chạy không làm cả dòng "rung" ngang theo từng khung hình. */
const TABULAR = { fontVariant: ['tabular-nums' as const] };

const defaultFormat = (value: number) => formatNumber(Math.round(value));

export interface AnimatedNumberProps extends Omit<TextProps, 'children'> {
  /** Lần gắn ĐẦU có đếm từ 0 lên không (mặc định có). Tắt cho số nằm trong danh sách hay vẽ lại. */
  countOnMount?: boolean;
  /** Định dạng hiển thị — mặc định `formatNumber` làm tròn (`1.234`). Nhận số THỰC đang chạy, tự làm tròn nếu cần. */
  format?: (value: number) => string;
  value: number;
}

/**
 * Con số "chạy" tới giá trị mới (đếm lên/xuống, chậm dần cuối đường) — cho XP, xu, chuỗi ngày, tổng thống kê.
 *
 * ```tsx
 * <AnimatedNumber className="text-header-md font-bold text-fg-1" value={profile.xp} />
 * <AnimatedNumber format={(n) => `${formatNumber(Math.round(n))} xu`} value={balance} />
 * ```
 *
 * ── Vì sao chạy trên luồng JS (setState mỗi khung hình) chứ không Reanimated ─────────────────────────────────────
 * Một `<Text>` nhỏ vẽ lại ~36 lần trong 600ms là rẻ, và giữ được mọi thứ của `<Text>` thật: class NativeWind, font của thang
 * chữ, trợ năng. Bản "chạy trên luồng UI" phải đổi sang `TextInput` + `animatedProps` — trên Android nó mang đệm/gạch chân
 * riêng và không nhận font của thang chữ đúng cách. ⚠️ Vì vậy ⛔ đừng đặt hàng trăm `AnimatedNumber` cùng lúc (mỗi ô danh sách
 * một cái) — dùng `countOnMount={false}` hoặc `Text` thường ở đó.
 *
 * ── Hành vi ─────────────────────────────────────────────────────────────────────────────────────────────────────
 * · Đổi `value` giữa chừng ⇒ chạy tiếp từ số ĐANG HIỆN, không giật về số cũ.
 * · "Giảm chuyển động" bật ⇒ hiện ngay số cuối, không đếm.
 * · Trình đọc màn hình luôn nghe số CUỐI (`accessibilityLabel`), không nghe các số trung gian.
 */
export function AnimatedNumber({
  accessibilityLabel,
  countOnMount = true,
  format = defaultFormat,
  style,
  value,
  ...textProps
}: AnimatedNumberProps) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(() => (countOnMount ? 0 : value));
  /** Số đang hiện — điểm xuất phát khi `value` đổi giữa chừng. Ghi trong khung hình, không đọc lúc render. */
  const currentRef = useRef(countOnMount ? 0 : value);

  useEffect(() => {
    if (reduceMotion) {
      currentRef.current = value;
      return undefined;
    }
    const from = currentRef.current;
    if (from === value) return undefined;

    const startedAt = Date.now();
    let frame = requestAnimationFrame(function tick() {
      const t = Math.min(1, (Date.now() - startedAt) / MOTION_DURATION.slow);
      // easeOutCubic — lao nhanh rồi chậm dần ở số cuối (cùng đường cong của bộ đếm trong tham chiếu dashboard).
      const next = from + (value - from) * (1 - (1 - t) ** 3);
      currentRef.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    });

    return () => cancelAnimationFrame(frame);
  }, [reduceMotion, value]);

  return (
    <Text
      accessibilityLabel={accessibilityLabel ?? format(value)}
      style={[TABULAR, style]}
      {...textProps}
    >
      {format(reduceMotion ? value : shown)}
    </Text>
  );
}
