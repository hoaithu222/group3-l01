import { View } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

import type { CheckboxSize } from './checkbox.types';

/** Số đo lấy từ SVG của Figma (`Huge-icon/interface/solid/check-rectangle`). */
const TICK = {
  sm: { height: 9, width: 5 },
  md: { height: 11, width: 6 },
} as const;

/** Gạch ngang của trạng thái nửa chọn: Figma vẽ 9,5×1,5 trong ô 20dp. */
const DASH = {
  sm: { height: 1.5, width: 8 },
  md: { height: 1.5, width: 10 },
} as const;

interface CheckboxMarkProps {
  /**
   * Lớp MÀU do recipe của `Checkbox` truyền xuống. Chứa cả `bg-*` (cho gạch
   * ngang) lẫn `border-*` (cho dấu tick) — mỗi hình chỉ dùng một cái.
   */
  className: string;
  /** `true` → gạch ngang (nửa chọn); `false` → dấu tick. */
  indeterminate: boolean;
  size: CheckboxSize;
}

/**
 * Dấu bên trong ô checkbox.
 *
 * ── Vì sao VẼ bằng `<View>` chứ không dùng `<Icon>` ─────────────────────────
 * Bản thiết kế dựng dấu tick bằng icon `check-rectangle` — nhưng đó là icon
 * GỘP cả khung ô lẫn dấu: tô một màu đặc rồi KHOÉT dấu ra thành lỗ trong suốt.
 * Đưa nguyên icon đó vào đây thì:
 *  · màu ô đi theo `color` của icon, còn màu dấu là "thủng" — tức là màu NỀN
 *    phía sau. Đặt checkbox lên thẻ màu khác là dấu tick đổi màu theo, không
 *    còn trắng;
 *  · chọn / nửa chọn / khoá là BA icon khác nhau, nên đổi trạng thái thành đổi
 *    cả hình thay vì đổi một lớp màu.
 * ⚠️ Và quyết định hơn cả: bộ icon xuất từ Figma (`assets/icons/system/`) hiện
 * KHÔNG có dấu tick đơn nào — chỉ có `tick-double-01` (dấu tick ĐÔI, sai
 * nghĩa). Xem mục "icon còn thiếu" trong báo cáo.
 *
 * Nên ô được ghép từ `<View>` (viền + nền + bo góc = token) và dấu vẽ bằng hai
 * cạnh viền xoay 45° — cách dựng dấu tick cổ điển, không cần tài nguyên nào, và
 * MÀU vẫn đi qua className nên đổi theme là tự đúng.
 */
export function CheckboxMark({ className, indeterminate, size }: CheckboxMarkProps) {
  if (indeterminate) {
    return <View className={cn('rounded-full', className)} style={DASH[size]} />;
  }

  return (
    <View
      /**
       * ⚠️ Thứ tự trong `cn()` có nghĩa: `className` mang sẵn một lớp `bg-*`
       * (dùng cho gạch ngang), đặt TRƯỚC để `bg-transparent` xoá được nó. Đảo
       * lại thì dấu tick biến thành một ô vuông đặc.
       *
       * ⚠️ `-mt-0.5`: khối xoay 45° có tâm hình học lệch xuống so với tâm thị
       * giác của dấu tick. Không nhích lên thì dấu trông chìm về đáy ô — thấy
       * rõ nhất khi checkbox xếp thành cột dài.
       */
      className={cn(className, '-mt-0.5 rotate-45 border-b-2 border-r-2 bg-transparent')}
      style={TICK[size]}
    />
  );
}
