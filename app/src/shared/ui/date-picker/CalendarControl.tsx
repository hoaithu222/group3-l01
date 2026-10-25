import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

import { calendarStyles } from './date-picker.styles';

export interface CalendarControlProps {
  nextDisabled?: boolean;
  /** Nhãn trợ năng nút phải — "Tháng sau" / "Năm sau" / "Thập kỷ sau". */
  nextLabel: string;
  previousDisabled?: boolean;
  /** Nhãn trợ năng nút trái. ⛔ Không bỏ trống: nút chỉ có icon nên đây là chữ DUY NHẤT. */
  previousLabel: string;
  title: string;
  /**
   * Tiêu đề tháng/năm có phải là một TIÊU ĐỀ với trình đọc màn hình không.
   *
   * ⛔ `false` khi lưới nằm trong tấm trượt đã có tiêu đề riêng: hai node
   * `accessibilityRole="header"` chồng nhau làm TalkBack đếm "2 tiêu đề" trong
   * một tấm, và điều hướng theo tiêu đề nhảy thẳng vào "Tháng 9 - 2026" thay vì
   * vào tên trường. Lịch đặt TRẦN trên màn hình thì `true` mới đúng — khi đó nó
   * là mốc điều hướng duy nhất của khối.
   */
  titleAsHeader?: boolean;
  onNext: () => void;
  onPrevious: () => void;
}

/**
 * Thanh điều khiển `‹ tiêu đề ›` của lưới lịch.
 *
 * Tách ra vì Figma vẽ ĐÚNG MỘT thanh này cho cả ba lưới — ngày ("Tháng 9 -
 * 2026"), tháng ("2026") và năm ("2020 – 2029"); chỉ chữ ở giữa và bước nhảy
 * của hai mũi tên là khác. Chép ba lần thì ba lần sau đó ai sửa `hitSlop` hay
 * màu icon cũng chỉ sửa được một chỗ, và hai lưới kia lệch đi âm thầm.
 */
export function CalendarControl({
  nextDisabled = false,
  nextLabel,
  previousDisabled = false,
  previousLabel,
  title,
  titleAsHeader = true,
  onNext,
  onPrevious,
}: CalendarControlProps) {
  const styles = calendarStyles();

  return (
    <View className={styles.control()}>
      <Pressable
        accessibilityLabel={previousLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: previousDisabled }}
        className={styles.navButton()}
        disabled={previousDisabled}
        /** Nút 40dp theo Figma — `hitSlop` bù cho đủ ngưỡng chạm 44dp. */
        hitSlop={8}
        onPress={onPrevious}
      >
        {/* ⛔ `pressed` lấy ở CHILDREN — `className` không nhận hàm. ⛔ `collapsable={false}`: vòng chỉ có nền LÚC BẤM, thiếu cờ
            này Android dựng view không kèm `rounded-full` ⇒ vệt bấm vuông (xem `CalendarDay`). */}
        {({ pressed }) => (
          <View className={calendarStyles({ pressed }).navButtonInner()} collapsable={false}>
            <Icon
              color={previousDisabled ? 'action-disabled-fg' : 'fg-brand'}
              name="arrow-left"
              size="sm"
            />
          </View>
        )}
      </Pressable>

      <Text accessibilityRole={titleAsHeader ? 'header' : undefined} className={styles.title()}>
        {title}
      </Text>

      <Pressable
        accessibilityLabel={nextLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: nextDisabled }}
        className={styles.navButton()}
        disabled={nextDisabled}
        hitSlop={8}
        onPress={onNext}
      >
        {({ pressed }) => (
          <View className={calendarStyles({ pressed }).navButtonInner()} collapsable={false}>
            <Icon
              color={nextDisabled ? 'action-disabled-fg' : 'fg-brand'}
              name="arrow-right"
              size="sm"
            />
          </View>
        )}
      </Pressable>
    </View>
  );
}
