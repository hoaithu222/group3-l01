import { forwardRef, useState } from 'react';
import { View, type TextInput } from 'react-native';

import { InputControls } from './InputControls';
import { InputLabel } from './InputLabel';
import { InputMessage } from './InputMessage';
import { inputStyles, type InputState } from './input.styles';
import type { BlurHandler, FocusHandler, InputProps } from './input.types';

/**
 * Ô nhập của bộ giao diện — nhãn, dấu bắt buộc, chú thích phải nhãn, thông báo
 * dưới ô, năm trạng thái viền (thường / focus / lỗi / chỉ-đọc / vô hiệu hoá).
 *
 * Không dính gì tới `react-hook-form`; cần nối vào form thì dùng `FormInput`
 * cùng thư mục. Props: `input.types.ts` · số đo, token màu: `input.styles.ts`.
 * Hàng gõ chữ (ô nhập + biểu tượng đuôi + nút xoá + nút con mắt) nằm ở
 * `InputControls.tsx` — file này chỉ dựng KHUNG quanh nó.
 *
 * ── ⛔ Ba thứ quên là hỏng THẬT trên máy, ngoài phần chú thích trong JSX ─────
 *
 * 1. Ô TÌM KIẾM không được controlled. Component này cố ý KHÔNG khai `value` —
 *    ô tìm kiếm phải truyền `defaultValue` và debounce ở tầng lọc, vì `value=`
 *    ghi đè nội dung ngay giữa lúc bộ gõ Telex ghép dấu (Android MẤT DẤU hoặc
 *    con trỏ nhảy về đầu). ESLint chặn cứng ca đó.
 *
 * 2. Bàn phím che ô nhập. ⛔ Đừng dựng lại `KeyboardAvoidingView` — nó hành xử
 *    khác nhau giữa hai nền tảng. Màn hình chứa Input phải bọc bằng
 *    `KeyboardAwareScrollView` của `react-native-keyboard-controller`, kèm
 *    `keyboardShouldPersistTaps="handled"` (thiếu thì cú chạm đầu tiên chỉ đóng
 *    bàn phím và KHÔNG tới được nút). Mẫu: `AuthScreenLayout.tsx`.
 *
 * 3. Ô số phải bật `digitsOnly`: bàn phím số của Android VẪN có dấu chấm, phẩy
 *    và dấu trừ, và "1.000,5" chỉ hỏng ở tận lúc gọi API.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    className,
    clearLabel,
    clearable = false,
    digitsOnly = false,
    disabled = false,
    hint,
    inputClassName,
    label,
    labelInside = false,
    leading,
    message,
    messageTone = 'error',
    multiline = false,
    readOnly = false,
    required = false,
    secure = false,
    size = 'md',
    trailing,
    onBlur,
    onChangeText,
    onFocus,
    ...rest
  },
  ref,
) {
  const [focused, setFocused] = useState(false);

  const hasError = messageTone === 'error' && message !== undefined;

  // ⚠️ `readonly` đứng TRƯỚC `focused`: ô chỉ-đọc vẫn nhận cú chạm (nó cố ý cho
  // chọn/sao chép), nên để `focused` thắng thì ô chỉ-đọc hiện viền xanh như thể
  // sắp gõ được — rồi bàn phím không lên.
  let state: InputState = 'default';
  if (disabled) state = 'disabled';
  else if (hasError) state = 'error';
  else if (readOnly) state = 'readonly';
  else if (focused) state = 'focused';

  const styles = inputStyles({ labelInside, multiline, size, state, tone: messageTone });

  // Trình đọc màn hình đọc dấu `*` thành "sao" — vô nghĩa. Gấp thông tin "bắt
  // buộc" vào chính nhãn của ô thay vì để nó nằm ở một node riêng.
  const fieldLabel = required && label !== undefined ? `${label}, bắt buộc` : label;

  const handleFocus: FocusHandler = (event) => {
    setFocused(true);
    onFocus?.(event);
  };

  const handleBlur: BlurHandler = (event) => {
    setFocused(false);
    onBlur?.(event);
  };

  const labelBlock =
    label === undefined ? null : (
      <InputLabel hint={hint} label={label} required={required} styles={styles} />
    );

  /**
   * Tách thành biến vì hai bố cục dùng LẠI nguyên khối này ở hai chỗ khác nhau
   * trong cây — nhãn ngoài khung thì nó là con trực tiếp của khung, nhãn trong
   * khung thì nó nằm dưới nhãn trong một hàng riêng.
   */
  const controls = (
    <InputControls
      {...rest}
      ref={ref}
      clearable={clearable}
      clearLabel={clearLabel}
      digitsOnly={digitsOnly}
      disabled={disabled}
      fieldLabel={fieldLabel}
      inputClassName={inputClassName}
      leading={leading}
      message={message}
      multiline={multiline}
      readOnly={readOnly}
      secure={secure}
      styles={styles}
      trailing={trailing}
      onBlur={handleBlur}
      onChangeText={onChangeText}
      onFocus={handleFocus}
    />
  );

  return (
    <View className={styles.root({ className })}>
      {labelInside ? null : labelBlock}

      <View className={styles.field()}>
        {labelInside ? (
          <>
            {labelBlock}
            <View className={styles.controlRow()}>{controls}</View>
          </>
        ) : (
          controls
        )}
      </View>

      {/* Dòng thông báo chỉ chiếm chỗ khi CÓ nội dung. Giữ chỗ trống sẵn thì form
          thưa ra vô lý; không giữ thì bố cục nhảy lúc lỗi hiện — chấp nhận nhảy,
          vì đó chính là tín hiệu thị giác báo có gì đó vừa đổi. */}
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
});
