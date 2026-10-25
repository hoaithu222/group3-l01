import { useState, type ReactNode, type Ref } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

import { useCaretColors, useThemeColors } from '@/shared/theme';

import { InputClearButton } from './InputClearButton';
import { InputSecureToggle } from './InputSecureToggle';
import type { inputStyles } from './input.styles';
import { useInputClear } from './use-input-clear';

export interface InputControlsProps extends Omit<TextInputProps, 'editable'> {
  /** Nhãn trợ năng của nút xoá. Mặc định ở `InputClearButton`. */
  clearLabel?: string;
  clearable: boolean;
  digitsOnly: boolean;
  disabled: boolean;
  /** Nhãn ĐÃ gấp chữ "bắt buộc" — `Input` tính sẵn, xem `fieldLabel` bên đó. */
  fieldLabel?: string;
  inputClassName?: string;
  leading?: ReactNode;
  /** Dòng thông báo dưới ô, đưa vào `accessibilityHint`. */
  message?: string;
  multiline: boolean;
  readOnly: boolean;
  ref?: Ref<TextInput>;
  secure: boolean;
  /** Công thức đã tính sẵn của `Input` — cùng lối truyền với `InputLabel`. */
  styles: ReturnType<typeof inputStyles>;
  trailing?: ReactNode;
}

/**
 * Hàng điều khiển của ô nhập: `[icon dẫn đầu] [ô nhập] [đuôi] [×] [con mắt]`.
 *
 * Tách khỏi `Input.tsx` vì file component phải ≤ 200 dòng (xem
 * `docs/rules/code-style.md`) — `Input.tsx` giữ phần KHUNG (nhãn, viền theo
 * trạng thái, dòng thông báo), file này giữ phần GÕ CHỮ. Hai bố cục của `Input`
 * (nhãn ngoài khung / nhãn trong khung) dựng lại NGUYÊN khối này ở hai chỗ khác
 * nhau trong cây, nên nó vốn đã là một khối rời.
 *
 * ⚠️ `revealed` (đã hiện mật khẩu hay chưa) sống ở ĐÂY chứ không ở `Input`: chỉ
 * `TextInput` và nút con mắt cần nó, mà `Input` thì đã đủ ba state rồi.
 */
export function InputControls({
  clearLabel,
  clearable,
  digitsOnly,
  disabled,
  fieldLabel,
  inputClassName,
  leading,
  message,
  multiline,
  readOnly,
  ref,
  secure,
  styles,
  trailing,
  onChangeText,
  ...rest
}: InputControlsProps) {
  // `placeholderTextColor` và `color` của `Icon` chỉ ăn màu THÔ, không nhận
  // className — bỏ trống thì placeholder rơi về xám mặc định của hệ điều hành.
  // `fg-3` là bậc PLACEHOLDER (2.96:1 sáng / 4.61:1 tối trên `bg-input`), còn
  // `fg-4` cũ chỉ 1.73:1. Ô KHOÁ: cặp `action-disabled` / `action-disabled-fg`.
  const colors = useThemeColors();
  // Con trỏ/vùng bôi theo màu thương hiệu thay vì teal mặc định của Android — xem `useCaretColors`.
  const caret = useCaretColors();
  const mutedInk = disabled ? 'action-disabled-fg' : 'fg-3';
  /**
   * ⛔ Hai nút ở đuôi ô (× và con mắt) KHÔNG dùng bậc placeholder.
   *
   * Chúng là ĐIỀU KHIỂN bấm được, mà hình vẽ là dấu hiệu duy nhất của chúng ⇒
   * ngưỡng 3:1 của thành phần phi văn bản. `fg-3` (#969696 trên `bg-input`
   * trắng) đo được **2.96:1** — trượt ngưỡng, nút gần như tan vào ruột ô.
   * `fg-2`: **5.74:1** ở chế độ sáng (#666666 trên #FFFFFF) · **8.42:1** ở chế
   * độ tối (#B7C4C0 trên #1E2826). Cùng cách vá và cùng lý do với
   * `alert/AlertCloseButton.tsx`.
   *
   * ⚠️ Placeholder thì GIỮ `fg-3`: nó là chữ gợi ý sẽ biến mất ngay khi người
   * dùng gõ, không phải điều khiển — kéo nó lên `fg-2` là placeholder trông y
   * như giá trị đã nhập thật.
   */
  const controlInk = disabled ? 'action-disabled-fg' : 'fg-2';
  const [revealed, setRevealed] = useState(false);

  /**
   * ⛔ Phá lẻ NGAY tại đây, đừng giữ nguyên object rồi đọc `clear.visible`:
   * `setRef` đi thẳng vào prop `ref` của `TextInput`, nên React Compiler kết
   * luận cả object là một REF — và mọi lần đọc thuộc tính khác của nó trong lúc
   * vẽ đều bị `react-hooks/refs` chặn ("Cannot access refs during render").
   */
  const {
    clear,
    setRef,
    track,
    visible: showClear,
  } = useInputClear(
    { clearable, defaultValue: rest.defaultValue, disabled, readOnly, ref, value: rest.value },
    onChangeText,
  );

  const handleChangeText = (text: string) => {
    track(text);
    onChangeText?.(digitsOnly ? text.replace(/\D+/g, '') : text);
  };

  return (
    <>
      {leading}

      <TextInput
        // ⛔ `setRef` của hook chứ KHÔNG phải `ref` trần: hook phải giữ một bản
        // để gọi `.clear()`. Nó vẫn chuyển tiếp node cho nơi gọi (xem
        // `assignRef`), nên `form.setFocus()` và `inputRef.current?.focus()`
        // không đổi gì — bỏ qua bước này là ref của caller im lặng thành `null`.
        ref={setRef}
        /**
         * ⚠️ Câu lỗi nằm ở HAI chỗ, và đó là đánh đổi có chủ ý.
         *
         * `InputMessage` gắn `accessibilityRole="alert"` để câu lỗi được xướng
         * NGAY lúc nó hiện ra; `accessibilityHint` ở đây để người dùng lia lại
         * vào ô sau đó vẫn nghe được lý do ô này đang đỏ — role `alert` chỉ
         * phát MỘT lần, nó không dính vào ô. Cái giá: ai đang đứng sẵn trên ô
         * lúc lỗi xuất hiện sẽ nghe câu đó hai lần. ⛔ Đừng gỡ `accessibilityHint`
         * để tránh lần lặp đó — gỡ là ô nhập sai thành ô KHÔNG nói được mình
         * sai ở đâu, tệ hơn hẳn.
         */
        accessibilityHint={message}
        accessibilityLabel={fieldLabel}
        // ⛔ Cả `readOnly` — vì sao: `input.types.ts`, mục `readOnly`.
        accessibilityState={{ disabled: disabled || readOnly }}
        /**
         * ⛔ Bốn mặc định dưới đây quên là hỏng trên máy thật, không phải ý
         * thích. Tất cả đặt TRƯỚC spread nên caller ghi đè được.
         *
         * `autoCapitalize="none"` — iOS viết hoa chữ đầu câu ⇒ e-mail thành
         *   "Abc@x.com" và backend phân biệt hoa/thường từ chối đăng nhập với
         *   một lỗi không nói gì. Ô nhập tên người thì caller đổi `"words"`.
         *
         * `autoCorrect={false}` — bàn phím tự sửa e-mail thành một từ tiếng
         *   Việt gần giống; người dùng gõ đúng mà ô nhập hiện sai.
         *
         * `autoComplete` + `textContentType` — thiếu thì iCloud Keychain /
         *   Google Password Manager KHÔNG nhận ra ô mật khẩu và không gợi ý
         *   điền. Ô e-mail/OTP thì caller khai đúng loại.
         *
         * `keyboardType` — ô `digitsOnly` mở thẳng bàn phím số. `number-pad`
         *   chứ không `numeric`: bản `numeric` của iOS kèm dấu thập phân mà
         *   `digitsOnly` sẽ nuốt mất — một phím bấm được nhưng vô tác dụng.
         */
        autoCapitalize="none"
        autoComplete={secure ? 'current-password' : undefined}
        autoCorrect={false}
        {...caret}
        keyboardType={digitsOnly ? 'number-pad' : undefined}
        textContentType={secure ? 'password' : undefined}
        {...rest}
        className={styles.control({ className: inputClassName })}
        editable={!disabled && !readOnly}
        multiline={multiline}
        placeholderTextColor={colors[mutedInk]}
        secureTextEntry={secure && !revealed}
        // Không khai thì Android canh chữ theo mép trên của khung font: ô một
        // dòng lệch lên vài pixel so với biểu tượng bên cạnh.
        textAlignVertical={multiline ? 'top' : 'center'}
        onChangeText={handleChangeText}
      />

      {trailing}

      {/* ⛔ Nút xoá đứng SAU `trailing`, không thay chỗ của nó: `trailing` là
          khe của nơi gọi (đơn vị "VND", nút chọn danh bạ…) và Figma cũng xếp
          đúng thứ tự này — `VND` → `icon_ht_cancel` → `icon_ht_contact-list`.
          Hai thứ phải sống chung được, nếu không thì mọi ô số tiền có nút xoá
          đều mất đơn vị tiền tệ. */}
      {showClear ? (
        <InputClearButton color={controlInk} label={clearLabel} onPress={clear} />
      ) : null}

      {secure ? (
        <InputSecureToggle
          color={controlInk}
          disabled={disabled}
          revealed={revealed}
          onToggle={() => setRevealed((current) => !current)}
        />
      ) : null}
    </>
  );
}
