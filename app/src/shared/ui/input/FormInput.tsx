import type { Ref, RefObject } from 'react';
import type { TextInput } from 'react-native';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';

import { Input } from './Input';
import type { InputProps } from './input.types';

/**
 * `Input` đã nối sẵn vào `react-hook-form`.
 *
 * Lấy `error` từ `fieldState` nên màn hình không phải tự bới `formState.errors`
 * theo tên trường — chỗ đó rất dễ gõ sai tên và lỗi thì "không hiện" một cách
 * im lặng. Mọi prop còn lại chuyển thẳng xuống `Input`.
 *
 * ── ⚠️ Ô này CONTROLLED, và đó là ngoại lệ có chủ đích ───────────────────────
 * `react-hook-form` cần `value` để `reset()`, `setValue()` và điền lại dữ liệu
 * từ máy chủ chạy được. ⛔ Vì vậy KHÔNG dùng `FormInput` cho ô TÌM KIẾM: state
 * đi qua một nhịp bất đồng bộ sẽ ghi đè ô nhập giữa lúc bộ gõ Telex đang ghép
 * dấu, và trên Android chữ mất dấu hoặc con trỏ nhảy về đầu. Ô tìm kiếm dùng
 * `Input` trần với `defaultValue` + debounce ở tầng lọc.
 *
 * Với form thật thì rủi ro đó không có: `useZodForm` đặt `mode: 'onTouched'`,
 * tức là không có `setValue` nào chạy trong lúc người dùng đang gõ.
 *
 * ⚠️ Cắt khoảng trắng thuộc về SCHEMA (`.trim()` trong zod), không phải ô nhập.
 * Bàn phím di động tự chèn một dấu cách sau khi người dùng nhận gợi ý tự động
 * hoàn thành, và cắt ngay lúc gõ thì không gõ nổi dấu cách giữa hai từ.
 */
export interface FormInputProps<TValues extends FieldValues> extends Omit<
  InputProps,
  'defaultValue' | 'onChangeText' | 'value'
> {
  control: Control<TValues>;
  name: FieldPath<TValues>;
  /**
   * Ref tới `TextInput` bên trong — để `.focus()` nhảy sang ô kế khi người dùng
   * bấm "Tiếp" trên bàn phím.
   *
   * ⚠️ Thường KHÔNG cần: `form.setFocus('ten-truong')` của react-hook-form dùng
   * đúng ref mà component này đã gắn sẵn, và không phải giữ thêm biến nào.
   */
  inputRef?: Ref<TextInput>;
}

/** Gắn cùng một node cho hai ref — react-hook-form giữ một, caller giữ một. */
function assignRef(target: Ref<TextInput> | undefined, node: TextInput | null) {
  if (typeof target === 'function') target(node);
  else if (target) (target as RefObject<TextInput | null>).current = node;
}

export function FormInput<TValues extends FieldValues>({
  control,
  inputRef,
  message,
  messageTone = 'hint',
  name,
  onBlur,
  ...inputProps
}: FormInputProps<TValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const error = fieldState.error?.message;

        return (
          <Input
            {...inputProps}
            /**
             * ⛔ Đừng bỏ `field.ref`. Thiếu nó thì `setFocus()` im lặng không
             * làm gì, và luồng "gõ xong ô này, bấm Tiếp để sang ô kế" — luồng
             * mà người dùng dùng suốt trên bàn phím điện thoại — chỉ đơn giản
             * là không chạy, không có lỗi nào báo.
             */
            ref={(node) => {
              field.ref(node);
              assignRef(inputRef, node);
            }}
            message={error ?? message}
            messageTone={error === undefined ? messageTone : 'error'}
            value={String(field.value ?? '')}
            /* ⛔ `field.onBlur` LUÔN chạy trước: `mode: 'onTouched'` của `useZodForm` dựa vào nó để biết ô đã được chạm
               (bỏ đi là lỗi kiểm tra không bao giờ hiện). `onBlur` của nơi gọi (vd mở lại minh hoạ màn đăng nhập) chạy SAU. */
            onBlur={(event) => {
              field.onBlur();
              onBlur?.(event);
            }}
            onChangeText={field.onChange}
          />
        );
      }}
    />
  );
}
