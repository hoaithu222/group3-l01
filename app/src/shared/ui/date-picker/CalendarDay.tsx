import { Pressable, Text, View } from 'react-native';
import type { Dayjs } from 'dayjs';

import {
  calendarDayStyles,
  type CalendarDayState,
  type CalendarRangePosition,
} from './date-picker.styles';

/**
 * Trần hệ số phóng cỡ chữ của con số trong ô.
 *
 * ⚠️ Vòng tròn ngày là RÀNG BUỘC THIẾT KẾ: nó phải TRÒN (`aspect-square`) và
 * không được rộng quá cột, nên chiều cao của nó do BỀ RỘNG cột quyết định chứ
 * không do chữ. Vì vậy ⛔ không đổi được sang `min-h-` — chặn cỡ chữ thay vào.
 *
 * Trần 1.3 tính theo ca XẤU NHẤT chứ không phải ca thường: trên máy 320dp trong
 * một thẻ có đệm riêng, cột chỉ còn ~36dp ⇒ vòng tròn cũng 36dp, mà nhãn
 * `text-label-md` (14/20) ở trần 1.3 cao 26dp — vẫn nằm gọn. Bỏ trần thì ở mức
 * phóng 2× con số cao 40dp, trào ra ngoài vòng rồi bị cắt.
 */
const MAX_FONT_SCALE = 1.3;

export interface CalendarDayProps {
  /** Ngày của ô. Luôn là nửa đêm giờ địa phương (xem `toDay`). */
  day: Dayjs;
  disabled: boolean;
  /**
   * Nhãn cho trình đọc màn hình — ngày ĐẦY ĐỦ ("Thứ Hai, 8 tháng 9 năm 2026").
   *
   * ⛔ Đừng rút gọn còn con số trong ô. Người khiếm thị vuốt qua 42 ô chỉ nghe
   * "một, hai, ba…" thì không biết đang ở tháng nào, thứ mấy — mà chọn sai ngày
   * giá trị của một lệnh chuyển tiền là chuyện không sửa lại được.
   */
  label: string;
  rangePosition: CalendarRangePosition;
  selected: boolean;
  state: CalendarDayState;
  onPress: (day: Dayjs) => void;
}

/**
 * Một ô ngày trong lưới.
 *
 * Tách khỏi `Calendar` vì `Calendar` vẽ 42 ô: gộp vào một file thì file vượt
 * giới hạn 200 dòng, và mỗi lần đổi tháng React phải so lại toàn bộ cây JSX
 * phẳng thay vì 42 component nhỏ.
 *
 * ── Ba lớp View, không phải một ─────────────────────────────────────────────
 *   `pressable` — cả CỘT, là vùng chạm (~49×44dp, trên ngưỡng 44dp);
 *   `track`     — dải nền của chế độ chọn khoảng, rộng bằng cột nên nối liền
 *                 qua khe 8dp giữa hai ô mà không cần hình vẽ như Figma;
 *   `circle`    — vòng tròn 40dp đúng cỡ thiết kế, chứa con số.
 */
export function CalendarDay({
  day,
  disabled,
  label,
  rangePosition,
  selected,
  state,
  onPress,
}: CalendarDayProps) {
  const styles = calendarDayStyles({ rangePosition, state });

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      /** ⚠️ Trình đọc màn hình KHÔNG thấy màu — trạng thái phải nói ra bằng lời. */
      accessibilityState={{ disabled, selected }}
      className={styles.pressable()}
      disabled={disabled}
      onPress={disabled ? undefined : () => onPress(day)}
    >
      {({ pressed }) => (
        /**
         * ⛔ `collapsable={false}` ở CẢ HAI lớp. Ô ngày thường không có nền/viền nên Fabric Android "làm phẳng" nó; lúc được chọn
         * (`circle` tô nền) hay nằm trong khoảng (`track` tô nền + `rounded-l/r-full`) Android mới dựng view với ĐÚNG phần props
         * vừa đổi ⇒ `rounded-*` rơi mất, ngày chọn thành ô vuông. Chi tiết: `docs/rules/styling-nativewind.md` → "Cạm bẫy".
         */
        <View className={styles.track()} collapsable={false}>
          <View
            className={styles.circle({
              /**
               * Phản hồi lúc bấm lấy từ render-prop của `Pressable`, KHÔNG phải
               * `useState`: state thủ công phải nghe `onPressOut`, mà sự kiện đó
               * KHÔNG bắn khi ngón tay trượt ra ngoài rồi mới nhấc — ô kẹt ở
               * dáng "đang bấm" cho tới lần chạm sau.
               */
              className: pressed && !selected ? 'bg-action-tint' : undefined,
            })}
            collapsable={false}
          >
            <Text className={styles.label()} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {day.date()}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}
