import { type ReactNode } from 'react';
import { type AccessibilityRole, View } from 'react-native';
import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Lề ngang 16dp — cùng số đo với `px-4` của thân tấm `padded` (đó cũng là lề của tiêu đề tấm).
 *
 * ⚠️ Cố ý KHÔNG có `gap`: hàng trong danh sách DÍNH nhau và ngăn nhau bằng kẻ `divider` của `ListItem`. Khe 8 của `padded`
 * chèn giữa hai hàng thì kẻ và hàng kế tiếp hở ra một dải trắng (đúng lỗi `SelectSheet` từng dính, xem `bodyClassName="gap-0"`).
 */
const sheetList = tv({ base: 'px-md' }, { twMergeConfig });

export interface SheetListProps {
  /** Nhãn trợ năng của cả khối (vd "Hạn xác nhận") — dùng cùng `accessibilityRole="radiogroup"`/`"list"`. */
  accessibilityLabel?: string;
  /** `menu` cho danh sách hành động, `radiogroup` cho danh sách chọn một, `list` cho danh sách thông tin. Bỏ trống = không đặt vai. */
  accessibilityRole?: AccessibilityRole;
  /** `ListItem`, hàng tự dựng, tiêu đề nhóm… — MỌI thứ đặt trong đây được thụt 16dp, không cần tự khai `px-*`. */
  children: ReactNode;
  /** Lớp thêm (đệm dưới, khe giữa các nhóm…). Đè `px-md` được nếu thật sự cần. */
  className?: string;
}

/**
 * Thân của một tấm DANH SÁCH HÀNG (`padded={false}`): bọc các `ListItem` để chúng có LỀ NGANG 16dp.
 *
 * ── Vì sao có component này ─────────────────────────────────────────────────────────────────────────────────────
 * `padded={false}` = tấm TRÀN VIỀN — nó gỡ lề của vùng nội dung để dành cho hàng nào tự lo lề (`SelectOptionRow`, hàng
 * chat, khối full-bleed). Nhưng `ListItem` KHÔNG tự có lề (nó vốn nằm trong `Card` đã có đệm), nên đặt `ListItem` trần
 * vào tấm `padded={false}` thì icon và chữ DÍNH SÁT mép tấm, lệch 16dp so với tiêu đề — lỗi đã lặp ở `ItemTypePicker`
 * ("Thêm mục" khi tạo nội dung bài học), `AddMenuSheet`, `HeatmapDaySheet`, các menu chủ trì… Cách viết đúng đã có sẵn
 * ở `ActionMenuSheet` (bọc `px-md`); component này là chính cách viết đó, đặt tên và đặt vào bộ chung để không ai phải
 * nhớ tự chép lại.
 *
 * ```tsx
 * <BottomSheet padded={false} title="Thêm mục" visible={visible} onClose={onClose}>
 *   <SheetList accessibilityRole="menu">
 *     {items.map((item, index) => (
 *       <ListItem key={item.key} divider={index < items.length - 1} emphasis="title" label={item.label} onPress={…} />
 *     ))}
 *   </SheetList>
 * </BottomSheet>
 * ```
 *
 * ── Khi nào KHÔNG dùng ─────────────────────────────────────────────────────────────────────────────────────────
 *  · Tấm `padded` mặc định: thân tấm đã có `px-4` ⇒ bọc thêm là thụt 32dp. Danh sách trong tấm đó chỉ cần MỘT `<View>`
 *    thường bọc ngoài (để mất khe 8 giữa các hàng có kẻ) — hoặc chuyển tấm sang `padded={false}` + `SheetList`.
 *  · Hàng ĐÃ tự có `px-*` (`SelectOptionRow` trong `SelectSheet`, hàng chat full-bleed): bọc `SheetList` là cộng lề hai lần.
 *
 * ⚠️ Chỉ lo LỀ NGANG. Đệm dưới (`pb-md`), kẻ ngăn (`divider` — bỏ ở hàng CUỐI) và chiều cao hàng vẫn do nơi gọi quyết.
 */
export function SheetList({
  accessibilityLabel,
  accessibilityRole,
  children,
  className,
}: SheetListProps) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      className={sheetList({ className })}
    >
      {children}
    </View>
  );
}
