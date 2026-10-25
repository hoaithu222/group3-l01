import { Text, View } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

export interface PageDotsProps {
  /** Trang đang xem (0-based). Ngoài khoảng thì bị kẹp về trang đầu/cuối. */
  activeIndex: number;
  className?: string;
  /** Tổng số trang; `≤ 1` thì không vẽ gì (một chấm đơn độc trông như lỗi hiển thị). */
  count: number;
}

/** Quá ngần này trang thì bỏ hàng chấm, chỉ còn chữ "Trang 3/12" — một hàng 12 chấm trên điện thoại 320dp chỉ là vệt mờ. */
const MAX_DOTS = 7;

/**
 * Chỉ báo trang của lưới: hàng chấm + CHỮ "Trang 2/3" trên viên `bg-overlay` của sân khấu tối. Cả cụm là MỘT ô trợ năng ("Trang 2 trên 3")
 * — không để trình đọc màn hình đọc từng chấm.
 *
 * ⛔ Trước đây dùng `SliderDot` trong viên `bg-bg-1` (nền THEO THEME): chế độ sáng ra một viên TRẮNG lốp giữa sân khấu đen (brief: trong
 * phòng không dùng `bg-bg-*`). Chấm tự vẽ bằng thang `white-*` (giống nhau ở hai theme): chấm đang xem là viên dài TRẮNG đặc, chấm khác
 * trắng 50% — phân biệt bằng HÌNH (dài/tròn) chứ không chỉ độ sáng.
 */
export function PageDots({ activeIndex, className, count }: PageDotsProps) {
  if (count <= 1) return null;
  const active = Math.min(Math.max(Math.trunc(activeIndex), 0), count - 1);

  return (
    <View
      accessibilityLabel={`Trang ${active + 1} trên ${count}`}
      accessible
      className={cn('flex-row items-center gap-xs self-center rounded-full bg-overlay px-sm py-2xs', className)}
    >
      {count <= MAX_DOTS ? (
        <View accessibilityElementsHidden className="flex-row items-center gap-2xs" importantForAccessibility="no-hide-descendants">
          {Array.from({ length: count }, (_, index) => (
            <View key={index} className={cn('h-1.5 rounded-full', index === active ? 'w-4 bg-white-10' : 'w-1.5 bg-white-5')} />
          ))}
        </View>
      ) : null}
      <Text className="text-caption-sm text-fg-on-nav" maxFontSizeMultiplier={1.3}>
        Trang {active + 1}/{count}
      </Text>
    </View>
  );
}
