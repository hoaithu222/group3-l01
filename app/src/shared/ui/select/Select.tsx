import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

import { InputLabel } from '../input/InputLabel';
import { InputMessage } from '../input/InputMessage';
import { inputStyles, type InputState } from '../input/input.styles';
import type { SelectProps } from './select.types';

/**
 * Ô CHỌN — trông y hệt `Input` nhưng là một cái NÚT: bấm vào thì nơi gọi mở
 * `SelectSheet` (hoặc màn hình chọn riêng, hoặc `DatePicker`… tuỳ nó).
 *
 * ── ⛔ Vì sao KHÔNG ghép được từ `Input` (đã đọc code, không phải suy đoán) ───
 *  1. `InputProps` (`input/input.types.ts`) `Omit` từ `TextInputProps` nên
 *     KHÔNG có `onPress`. Muốn bấm được thì mỗi nơi gọi phải tự bọc `Pressable`
 *     + `pointerEvents="none"` — bản vẽ có **30+** ô chọn, tức 30 bản sao của
 *     cùng một mẹo, và chỉ cần một chỗ quên `pointerEvents` là bàn phím bật lên
 *     trên một ô không gõ được.
 *  2. `readOnly` của `Input` (`input.styles.ts`, biến thể `state.readonly`) đổi
 *     HÌNH THỨC sang `border-transparent bg-action-disabled` — nền xám, không
 *     viền. Đúng cho ô chỉ-đọc, SAI cho ô chọn: bản vẽ giữ ô chọn TRẮNG và CÓ
 *     VIỀN hệt ô nhập thường, vì nó vẫn là chỗ người dùng phải tác động vào.
 *
 * ── ✅ Nhưng hình thức thì DÙNG LẠI, tuyệt đối không chép ────────────────────
 * `inputStyles` · `InputLabel` · `InputMessage` nhập THẲNG từ `../input/`. Chép
 * chuỗi class sang đây là cầm chắc hai component lệch nhau ở lần đổi token kế
 * tiếp — đúng thứ đã xảy ra với `DatePicker`: nó tự dựng hàng lỗi riêng, nên
 * dòng lỗi của ô ngày đến giờ vẫn khác nhịp với dòng lỗi của ô nhập.
 *
 * ⛔ Nhập THẲNG FILE, không qua `@/shared/ui`: barrel tổng tạo import vòng, mà
 * trên React Native vòng hiện ra lúc CHẠY dưới dạng `undefined is not a
 * function` ở một file KHÔNG liên quan tới chỗ sai. ESLint chặn cứng.
 *
 * @example
 *   const [open, setOpen] = useState(false);
 *   <Select
 *     label="Tỉnh/Thành, Phường/Xã"
 *     placeholder="Chọn Tỉnh/ Thành phố"
 *     required
 *     value={province?.label}
 *     onPress={() => setOpen(true)}
 *   />
 *   <SelectSheet … visible={open} onClose={() => setOpen(false)} />
 */
export function Select({
  className,
  disabled = false,
  label,
  leading,
  message,
  messageTone = 'error',
  placeholder = 'Chọn',
  required = false,
  value,
  onPress,
}: SelectProps) {
  const hasError = messageTone === 'error' && message !== undefined;

  /**
   * ⚠️ Chỉ ba trạng thái, KHÔNG có `focused`: ô chọn không nhận con trỏ nhập
   * nên không bao giờ focus. Cũng KHÔNG có `readonly` — ô chọn không sửa được
   * thì đúng nghĩa là `disabled` (xem chú thích ⛔ ở đầu file).
   */
  let state: InputState = 'default';
  if (disabled) state = 'disabled';
  else if (hasError) state = 'error';

  const styles = inputStyles({ state, tone: messageTone });

  /** Chuỗi rỗng cũng là "chưa chọn" — form thường reset về `''` chứ không về `undefined`. */
  const filled = value !== undefined && value !== '';
  const shown = filled ? value : placeholder;

  /**
   * Màu chữ khi chưa chọn: `fg-3` là bậc PLACEHOLDER của hệ token (2.96:1 —
   * ⛔ đúng vì nó là chữ mời gọi, KHÔNG phải nội dung).
   *
   * ⚠️ Chỉ đè khi ô còn sống. Ô bị khoá đã được biến thể `state.disabled` đặt
   * `text-action-disabled-fg` cho slot `control`; đè thêm `text-fg-3` vào đó là
   * chữ trong ô khoá sáng hơn hẳn phần còn lại và trông như ô vẫn bấm được.
   */
  const placeholderInk = !disabled && !filled ? 'text-fg-3' : undefined;

  /**
   * Màu mũi tên xổ xuống.
   *
   * ✅ `fg-brand`, KHÔNG phải `fg-3` — đã mở Figma đo lại (`703:27411`, ô "Chọn
   * Tỉnh/ Thành phố"): node bind biến `Foreground/Primary/Default`, và điểm ảnh
   * đọc được ở mũi tên đúng **#00453C**. Cùng màu với kính lúp mà `SearchInput`
   * đang dùng (`color="fg-brand"`), nên hai ô đứng cạnh nhau trong một tấm
   * trượt không còn một cái xám một cái xanh.
   *
   * ⚠️ Đây cũng là bản vá trợ năng, không chỉ là màu: `fg-3` #969696 trên nền ô
   * trắng chỉ **3.02:1** — sát ngưỡng 3:1 của hình phi văn bản tới mức một lần
   * chỉnh token là rơi xuống dưới. `fg-brand` đo được **10.96:1** ở chế độ sáng
   * (#00453C trên #FFFFFF) và **8.71:1** ở chế độ tối (#57D9BE trên #1E2826).
   *
   * ⛔ Lúc bị khoá thì vẫn về `action-disabled-fg`: giữ mũi tên xanh trên một ô
   * xám là ô khoá trông vẫn bấm được.
   */
  const arrowInk = disabled ? 'action-disabled-fg' : 'fg-brand';

  return (
    <View className={styles.root({ className })}>
      {label === undefined ? null : (
        <InputLabel label={label} required={required} styles={styles} />
      )}

      <Pressable
        /**
         * ⛔ Nhãn và GIÁ TRỊ tách làm hai khoá, không gộp vào một chuỗi.
         * `accessibilityValue.text` là chỗ TalkBack/VoiceOver đọc phần "đang
         * chọn gì" và cũng là chỗ chúng đọc LẠI sau mỗi lần giá trị đổi. Nhét
         * giá trị vào `accessibilityLabel` thì lần chọn thứ hai không được xướng
         * lên, và người khiếm thị không biết cú bấm của mình có ăn hay không.
         *
         * ⚠️ Chưa chọn thì đọc rõ "chưa chọn" — nếu chỉ đọc placeholder thì
         * "Chọn Tỉnh/ Thành phố" nghe hệt như một giá trị đã chọn.
         */
        accessibilityHint={message}
        accessibilityLabel={required && label !== undefined ? `${label}, bắt buộc` : label}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityValue={{ text: filled ? value : `Chưa chọn. ${placeholder}` }}
        className={styles.field()}
        disabled={disabled}
        onPress={onPress}
      >
        {leading}

        {/* ⚠️ `numberOfLines={1}`: ô chọn cao cố định 56 như ô nhập. Tên cửa hàng
            dài xuống hai dòng sẽ đẩy ô cao hơn hẳn các ô còn lại trong form —
            phần bị cắt vẫn đọc được đầy đủ qua `accessibilityValue`. */}
        <Text className={styles.control({ className: placeholderInk })} numberOfLines={1}>
          {shown}
        </Text>

        {/* ⛔ Tên icon là `arrow-down-small` — bộ của ngân hàng KHÔNG có
            `chevron-down`. Gõ tên không có thật thì `tsc` đỏ (kiểu `IconName`),
            nhưng gõ nhầm sang `arrow-down` thì lại là một mũi tên khác hẳn nét. */}
        <Icon color={arrowInk} name="arrow-down-small" />
      </Pressable>

      {/* Dòng thông báo chỉ chiếm chỗ khi CÓ nội dung — cùng nhịp với `Input`:
          hàng `[biểu tượng 16] + khe 4 + [chữ 14/20]`. */}
      {message === undefined ? null : (
        <InputMessage
          className={styles.messageRow()}
          text={message}
          textClassName={styles.message()}
          tone={messageTone}
        />
      )}
    </View>
  );
}
