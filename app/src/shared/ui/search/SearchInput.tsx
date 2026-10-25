import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { useThemeColors } from '@/shared/theme';
import { Icon } from '@/shared/ui/icon';

import { searchStyles, type SearchState, type SearchVariant } from './search.styles';
import { SearchClearButton } from './SearchClearButton';

/**
 * Ô tìm kiếm — viên thuốc bo tròn, kính lúp bên trái, nút xoá bên phải.
 *
 * ── ⛔ Ô này KHÔNG CÓ prop `value`, và đó là điểm quan trọng nhất ────────────
 * `<TextInput value={search} onChangeText={setSearch}>` mà state đi qua một
 * nhịp bất đồng bộ (debounce, cập nhật từ query, setState trong effect) sẽ ghi
 * ĐÈ lại ô nhập ngay giữa lúc bộ gõ đang ghép dấu. Trên Android + Telex, đúng
 * lúc đó là MẤT DẤU hoặc con trỏ nhảy về đầu — người dùng gõ "Đà Nẵng" ra "Da
 * Nang" và kết luận là app hỏng.
 *
 * Vì vậy `value` bị BỎ khỏi kiểu prop: truyền vào là `tsc` đỏ ngay, không đợi
 * tới lúc thử trên máy. ESLint cũng chặn cứng ca đó (`no-restricted-syntax`,
 * selector số 3). Cách đúng: `defaultValue` + `onChangeText` có debounce ở tầng
 * lọc — dùng `useSearchInput` cùng thư mục.
 *
 * ── Vì sao KHÔNG dựng lại trên `Input` của nhóm `input/` ────────────────────
 * Hình học khác hẳn (48 vs 56, bo tròn hoàn toàn vs bo 24, không nhãn, không
 * dòng thông báo) và `Input` không cho đổi lớp khung ô — dùng lại thì phải thêm
 * một loạt prop chỉ ô tìm kiếm mới dùng, đắt hơn 60 dòng này.
 *
 * @example
 *   const search = useSearchInput();
 *   <SearchInput {...search.inputProps} placeholder="Tìm giao dịch" />
 *   const rows = useMemo(() => filter(data, search.value), [data, search.value]);
 */
export interface SearchInputHandle {
  blur: () => void;
  /** Xoá nội dung ô nhập VÀ tắt nút xoá. Dùng cho nút "Xoá bộ lọc" ở ngoài. */
  clear: () => void;
  focus: () => void;
}

export interface SearchInputProps extends Omit<
  TextInputProps,
  'editable' | 'multiline' | 'onChangeText' | 'value'
> {
  className?: string;
  /** Nhãn cho trình đọc màn hình của nút xoá. */
  clearLabel?: string;
  defaultValue?: string;
  disabled?: boolean;
  /** Class riêng cho `TextInput` bên trong. */
  inputClassName?: string;
  ref?: Ref<SearchInputHandle>;
  /** `stroke` (mặc định) cho nền xám · `white` khi ô nằm trên nền màu. */
  variant?: SearchVariant;
  onChangeText?: (text: string) => void;
  /** Gọi thêm sau khi người dùng bấm nút xoá (`onChangeText('')` vẫn chạy). */
  onClear?: () => void;
}

export function SearchInput({
  className,
  clearLabel = 'Xoá nội dung tìm kiếm',
  defaultValue = '',
  disabled = false,
  inputClassName,
  placeholder = 'Tìm kiếm',
  ref,
  variant = 'stroke',
  onBlur,
  onChangeText,
  onClear,
  onFocus,
  ...rest
}: SearchInputProps) {
  /**
   * `placeholderTextColor` KHÔNG nhận className — đây là một trong số ít prop
   * chỉ ăn màu thô. Bỏ qua nó thì placeholder rơi về màu xám mặc định của hệ
   * điều hành: gần như vô hình ở chế độ tối.
   */
  const colors = useThemeColors();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  /**
   * ⚠️ Chỉ để BẬT/TẮT nút xoá, KHÔNG bao giờ chảy ngược vào `TextInput`. React
   * bỏ qua `setState` khi giá trị không đổi, nên biến này chỉ gây vẽ lại đúng
   * hai lần: lúc ô chuyển từ rỗng sang có chữ và ngược lại.
   */
  const [hasText, setHasText] = useState(defaultValue.length > 0);

  useImperativeHandle(ref, () => ({
    blur: () => inputRef.current?.blur(),
    clear: () => {
      inputRef.current?.clear();
      setHasText(false);
    },
    focus: () => inputRef.current?.focus(),
  }));

  let state: SearchState = 'default';
  if (disabled) state = 'disabled';
  else if (focused) state = 'focused';

  const styles = searchStyles({ state, variant });

  const handleChangeText = (text: string) => {
    if (disabled) return;
    setHasText(text.length > 0);
    onChangeText?.(text);
  };

  const handleClear = () => {
    // `clear()` là lệnh mệnh lệnh xuống thẳng native: nội dung biến mất mà
    // KHÔNG phải dựng lại `value` từ state — đúng thứ ô uncontrolled cần.
    inputRef.current?.clear();
    setHasText(false);
    onChangeText?.('');
    onClear?.();
    // Giữ bàn phím: người dùng bấm ✕ là để gõ lại, không phải để thoát ô.
    inputRef.current?.focus();
  };

  return (
    <View className={styles.field({ className })}>
      {/* Kính lúp 24dp màu THƯƠNG HIỆU, giữ nguyên cả khi ô khoá: Figma vẽ lõi
          icon #00453c (`Foreground/Primary/Default`) ở cả Default, Typing lẫn
          Disable. ⛔ Đừng hạ về xám `fg-3` — nó là thứ nói cho người dùng biết
          dải bo tròn kia là Ô TÌM KIẾM chứ không phải một chip lọc. */}
      <Icon color="fg-brand" name="search" size="md" />

      <TextInput
        ref={inputRef}
        accessibilityRole="search"
        accessibilityState={{ disabled }}
        /**
         * ⛔ Bốn prop dưới đây quên là hỏng trên máy thật, không phải ý thích:
         *
         * `autoCapitalize="none"` — iOS mặc định viết hoa chữ đầu câu, nên từ
         *   khoá thành "Đà nẵng" và bộ lọc phân biệt hoa/thường trượt hết.
         *
         * `autoCorrect={false}` — bàn phím tự sửa từ khoá đang gõ dở thành một
         *   từ khác; người dùng thấy danh sách nhảy sang kết quả họ không hỏi.
         *
         * `autoComplete="off"` + `textContentType="none"` — thiếu thì trình
         *   quản lý mật khẩu của hệ điều hành nhảy vào gợi ý điền e-mail/mật
         *   khẩu ngay trên ô tìm kiếm, che mất danh sách kết quả.
         *
         * Spread `{...rest}` nằm NGAY SAU nên nơi gọi ghi đè được tất cả.
         */
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect={false}
        textContentType="none"
        {...rest}
        className={styles.input({ className: inputClassName })}
        // ⛔ `clearButtonMode="never"`: iOS có sẵn một nút ✕ riêng, để mặc định
        // thì màn hình hiện HAI nút xoá chồng nhau và nút của hệ điều hành
        // không chạy qua `onClear` của mình.
        clearButtonMode="never"
        defaultValue={defaultValue}
        editable={!disabled}
        /* ⛔ KHÔNG có `hitSlop` ở đây, và đó là chủ ý: ô cao 48dp theo Figma,
           đã vượt ngưỡng chạm 44dp. Bản trước cao 40 nên phải bù 2dp mỗi chiều
           dọc — miếng vá cho một con số sai, không phải một quy ước. */
        placeholder={placeholder}
        placeholderTextColor={colors[disabled ? 'fg-4' : 'fg-3']}
        // Nút bàn phím nói đúng việc sắp xảy ra thay vì "Xuống dòng".
        returnKeyType="search"
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        onChangeText={handleChangeText}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
      />

      {/* ⚠️ Cố ý LỆCH bản vẽ: Figma chỉ hiện nút xoá ở hàng "Typing", hàng
          "Filled" (có chữ, không focus) thì không. Ở đây hiện bất cứ khi nào ô
          có chữ — xoá từ khoá cũ bằng MỘT chạm thay vì phải chạm vào ô lấy
          focus rồi mới chạm nút. Ghi ra để lần review sau không bắt lại. */}
      {hasText && !disabled ? (
        <SearchClearButton label={clearLabel} styles={styles} onPress={handleClear} />
      ) : null}
    </View>
  );
}
