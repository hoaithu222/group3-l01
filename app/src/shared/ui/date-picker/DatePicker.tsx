import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

import { BottomSheet } from '../bottom-sheet/BottomSheet';
import { Button } from '../button/Button';
import { Calendar } from './Calendar';
import { FORMAT_BY_PRECISION, PLACEHOLDER_BY_PRECISION } from './date-picker.constants';
import { datePickerStyles } from './date-picker.styles';
import type { DatePickerPrecision, DatePickerProps } from './date-picker.types';
import { formatValue } from './date-picker.utils';
import { useDatePickerDraft } from './useDatePickerDraft';

/**
 * Ô nhập ngày: bấm vào thì mở lịch trong tấm trượt đáy.
 *
 * ── Vỏ tấm trượt DÙNG LẠI `BottomSheet` của nhóm `bottom-sheet` ─────────────
 * ⛔ Nhập THẲNG `'../bottom-sheet/BottomSheet'`, không đi qua barrel
 * `@/shared/ui`: component nằm trong `src/shared/ui/` mà nhập chéo qua barrel
 * sẽ tạo import vòng, và trên React Native vòng hiện ra lúc CHẠY dưới dạng
 * `undefined is not a function` ở một file KHÔNG liên quan tới chỗ sai.
 * `Calendar` không dính gì tới tấm trượt — cần lịch trần thì dùng thẳng nó.
 *
 * ── Hai nhịp khác nhau, đúng bản thiết kế ───────────────────────────────────
 *  · `single` — bấm một ngày là XONG: gọi `onChange` rồi tự đóng. Figma ghi rõ
 *    "Chọn ngày đồng thời close bottom sheet", nút "Áp dụng" chỉ là tuỳ chọn.
 *    Bắt bấm thêm một nút nữa là bắt người dùng xác nhận thứ họ vừa thấy.
 *    ⚠️ Đúng cái "tuỳ chọn" đó là prop `confirm` — bật thì nhịp giống `range`.
 *  · `range` — chọn trên BẢN NHÁP, chỉ "Áp dụng" mới gọi `onChange`. Giữa hai
 *    nhịp, khoảng mới có một đầu; bắn ra ngoài lúc đó là màn hình cha gọi API
 *    với dữ liệu nửa vời.
 *
 * ── Bốn độ chi tiết (`precision`) ───────────────────────────────────────────
 * Mặc định `day`. `month`/`year` mở thẳng lưới 3×4; `year-month-day` đi ba nhịp
 * trong CÙNG một tấm trượt. Cả bốn vẫn trả về một `Date` nên `onChange` không
 * đổi kiểu; `format` và `placeholder` mặc định thì đổi theo (xem hai bảng ở
 * đầu file). ⛔ `precision` chỉ có ở chế độ một giá trị — xem `date-picker.types.ts`.
 *
 * ⛔ Định dạng mặc định `DD/MM/YYYY` — `03/04/2026` ở Việt Nam là 3 tháng 4.
 * Đừng để `toLocaleDateString()` quyết: nó đi theo ngôn ngữ máy của người dùng.
 */
export function DatePicker(props: DatePickerProps) {
  const {
    className,
    disabled = false,
    disabledDates,
    error,
    firstDayOfWeek,
    label,
    locale,
    maxDate,
    minDate,
    title,
  } = props;

  /* Trạng thái mở/đóng + bản nháp của cả ba nhịp — xem `useDatePickerDraft`. */
  const {
    confirmSingle,
    draft,
    isRange,
    open,
    singleDraft,
    close,
    confirm,
    openSheet,
    pickSingle,
    setDraft,
    setSingleDraft,
  } = useDatePickerDraft(props);

  /**
   * ⛔ Chọn KHOẢNG luôn theo NGÀY — `precision` chỉ có ở chế độ một giá trị.
   * ⚠️ So `props.mode` TẠI CHỖ chứ không dùng `isRange` của hook: TypeScript chỉ
   * thu hẹp union phân biệt khi điều kiện đọc thẳng từ `props`.
   */
  const precision: DatePickerPrecision =
    props.mode === 'range' ? 'day' : (props.precision ?? 'day');
  const format = props.format ?? FORMAT_BY_PRECISION[precision];
  const placeholder = props.placeholder ?? PLACEHOLDER_BY_PRECISION[precision];

  const display = formatValue(props.value, format);
  const shown = display === '' ? placeholder : display;

  let state: 'default' | 'disabled' | 'error' = 'default';
  if (disabled) state = 'disabled';
  else if (error !== undefined) state = 'error';

  const styles = datePickerStyles({ empty: display === '', state });
  /* ⛔ `titleAsHeader: false` — tấm trượt ĐÃ có tiêu đề mang vai `header`; hai
     vai `header` chồng nhau thì TalkBack đếm 2 tiêu đề trong một tấm và điều
     hướng theo tiêu đề nhảy vào "Tháng 9 - 2026" thay vì vào tên trường. */
  const calendarProps = { disabledDates, firstDayOfWeek, locale, maxDate, minDate };

  /**
   * Câu lỗi vẽ ở HAI chỗ, cố ý.
   *
   * Figma có ba màn "Error message" riêng (một cho chọn ngày, một cho chọn
   * Năm/Tháng, một cho chọn khoảng) và ở cả ba, câu lỗi nằm GIỮA lưới và nút
   * "Áp dụng" — không phải dưới ô nhập. Lý do: luồng thật là người dùng bấm một
   * ngày → luật nghiệp vụ từ chối → phải báo NGAY tại chỗ. Chỉ vẽ dưới ô nhập
   * thì muốn báo phải đóng tấm trượt trước, người dùng mất ngữ cảnh và phải mở
   * lại để chọn ngày khác.
   *
   * ⚠️ Cùng MỘT phần tử React dùng lại ở hai nhánh — hai chỗ này không bao giờ
   * cùng nhìn thấy được (tấm trượt che kín ô nhập), nên không có chuyện trình
   * đọc màn hình xướng câu lỗi hai lần.
   */
  const message =
    error === undefined ? null : (
      <View className={styles.messageRow()}>
        <Icon color="error" name="alert-warning" size="xs" />
        <Text className={styles.message()}>{error}</Text>
      </View>
    );

  return (
    <View className={styles.root({ className })}>
      {label === undefined ? null : (
        <Text className={styles.label()} numberOfLines={1}>
          {label}
        </Text>
      )}

      <Pressable
        /**
         * Nhãn gộp cả tên trường lẫn giá trị đang có: ô ngày là NÚT chứ không
         * phải ô nhập chữ, nên trình đọc màn hình cần nghe "Ngày sinh,
         * 08/09/2026" trong một lần thay vì hai node rời nhau.
         */
        accessibilityHint={error}
        accessibilityLabel={`${label ?? 'Ngày'}, ${shown}`}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        className={styles.field()}
        disabled={disabled}
        onPress={openSheet}
      >
        <Text className={styles.value()} numberOfLines={1}>
          {shown}
        </Text>
        <Icon color={disabled ? 'fg-5' : 'fg-3'} name="calendar" />
      </Pressable>

      {message}

      <BottomSheet
        footer={
          /* Một ngày thì mặc định KHÔNG có nút xác nhận (bật bằng `confirm`).
             Khoảng thì nút khoá tới khi đủ CẢ HAI đầu — nếu không người dùng
             bấm "Áp dụng" giữa chừng rồi tưởng mình đã chọn xong. */
          isRange || confirmSingle ? (
            <Button
              disabled={isRange ? !(draft.start && draft.end) : !singleDraft}
              fullWidth
              label="Áp dụng"
              onPress={confirm}
            />
          ) : undefined
        }
        title={title ?? label ?? PLACEHOLDER_BY_PRECISION[precision]}
        visible={open}
        onClose={close}
      >
        {/**
         * Chỉ dựng `Calendar` khi tấm trượt đang mở: nhờ vậy mỗi lần mở lại,
         * lịch nhảy về THÁNG CỦA GIÁ TRỊ đang chọn thay vì giữ tháng mà người
         * dùng lỡ lật tới ở lần mở trước — và luồng Năm → Tháng → Ngày cũng bắt
         * đầu lại từ nhịp đầu.
         */}
        {!open ? null : (
          <>
            {props.mode === 'range' ? (
              <Calendar
                {...calendarProps}
                mode="range"
                titleAsHeader={false}
                value={draft}
                onChange={setDraft}
              />
            ) : (
              <Calendar
                {...calendarProps}
                precision={precision}
                titleAsHeader={false}
                /* `confirm` bật ⇒ lịch chạy trên BẢN NHÁP, y như chế độ khoảng:
                   `onChange` của nơi gọi chỉ nổ khi bấm "Áp dụng". */
                value={confirmSingle ? singleDraft : props.value}
                onChange={confirmSingle ? setSingleDraft : pickSingle}
              />
            )}
            {/* Ngay trên nút "Áp dụng", đúng vị trí của ba màn Error message. */}
            {message}
          </>
        )}
      </BottomSheet>
    </View>
  );
}
