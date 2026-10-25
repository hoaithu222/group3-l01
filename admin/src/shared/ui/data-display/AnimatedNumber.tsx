/**
 * AnimatedNumber — con số CHẠY tới giá trị mới thay vì nhảy phịch một cái.
 *
 * Bản DOM của *digital flop* trong họ bảng điều khiển lớn (DataV). Cố ý KHÔNG
 * vẽ bằng `<canvas>` như bản gốc, vì canvas đánh mất bốn thứ base đang có:
 * token màu tự lật theo theme sáng/tối, thang chữ `text-*`, mức phóng `--ui-scale`
 * ở chế độ TV, và khả năng bôi đen để chép số ra ngoài. Chữ DOM giữ đủ cả bốn.
 *
 * ── Vì sao con số cần chạy ────────────────────────────────────────────────
 * Trên một màn hình có 20 con số, số nhảy phịch thì mắt KHÔNG bắt được cái nào
 * vừa đổi. Chuyển động là thứ ngoại vi của mắt nhạy nhất — nó kéo sự chú ý về
 * đúng ô vừa có tin mới mà không cần nhấp nháy hay đổi màu.
 *
 * ⚠️ `tabular-nums` là BẮT BUỘC và không tắt được. Font chữ thường có bề ngang
 *    chữ số khác nhau (số 1 hẹp hơn số 8), nên trong lúc chạy con số sẽ GIÃN RA
 *    CO VÀO theo từng khung hình và kéo cả hàng bên cạnh nhảy theo.
 *
 * Usage:
 *   <AnimatedNumber value={1234} />
 *   <AnimatedNumber value={0.876} format={(n) => formatPercent(n * 100)} />
 *   <AnimatedNumber value={total} format={(n) => formatMoneyCompactRaw(n).text} suffix=" đ" />
 */
import { memo } from 'react';

import { useCountUp } from '@/shared/hooks';
import { formatNumber } from '@/shared/utils/format/format.utils';
import { cn } from '@/shared/utils/style/cn';

export interface AnimatedNumberProps {
  /** Giá trị đích. Đổi giá trị ⇒ con số chạy từ chỗ đang đứng tới đây. */
  value: number;
  /**
   * Biến số thành chuỗi. Mặc định `formatNumber` (locale vi-VN, không phần lẻ).
   *
   * ⚠️ Hàm này chạy MỖI KHUNG HÌNH trong lúc số đang chạy — giữ nó thuần và rẻ.
   *    Đừng gọi API, đừng dựng `Intl.NumberFormat` mới bên trong (formatter của
   *    base đã nhớ sẵn theo số chữ số lẻ).
   */
  format?: (value: number) => string;
  /** Chữ đứng trước số (vd `'≈ '`). */
  prefix?: string;
  /** Đơn vị đứng sau số (vd `' đ'`, `'%'`). */
  suffix?: string;
  /** Thời lượng chạy (ms). Mặc định 900. */
  duration?: number;
  /**
   * Tắt hiệu ứng, in thẳng giá trị.
   *
   * BẬT cho số nằm trong BẢNG DÀI: 200 con số cùng chạy một lúc là nhiễu thị
   * giác, và không ai theo dõi được 200 thứ cùng lúc.
   */
  disabled?: boolean;
  className?: string;
}

const AnimatedNumber = memo(function AnimatedNumber({
  value,
  format = formatNumber,
  prefix,
  suffix,
  duration,
  disabled,
  className,
}: AnimatedNumberProps) {
  const current = useCountUp(value, { duration, disabled });

  return (
    <span className={cn('tabular-nums', className)}>
      {/*
        Trình đọc màn hình đọc GIÁ TRỊ ĐÍCH, không đọc từng bước chạy: `aria-label`
        chốt ở `value`, còn phần chữ đang chạy bị `aria-hidden`. Thiếu cặp này,
        NVDA/VoiceOver đọc liên tục hàng chục con số trung gian.
      */}
      <span aria-hidden="true">
        {prefix}
        {format(current)}
        {suffix}
      </span>
      <span className="sr-only">{`${prefix ?? ''}${format(value)}${suffix ?? ''}`}</span>
    </span>
  );
});

export default AnimatedNumber;
