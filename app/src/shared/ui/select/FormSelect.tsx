import {
  Controller,
  type Control,
  type FieldPath,
  type FieldPathValue,
  type FieldValues,
} from 'react-hook-form';

import { Select } from './Select';
import type { SelectProps } from './select.types';

/**
 * `Select` đã nối sẵn vào `react-hook-form` — bám đúng khuôn `FormInput.tsx`.
 *
 * Lấy `error` từ `fieldState` nên màn hình không phải tự bới `formState.errors`
 * theo tên trường; chỗ đó rất dễ gõ sai tên và lỗi thì "không hiện" một cách im
 * lặng. Mọi prop còn lại chuyển thẳng xuống `Select`.
 *
 * ── ⛔ `value` bị BỎ, thay bằng `format` — và đó là điểm khác `FormInput` ────
 * Form giữ MÃ (`"01"`, `"HN"`), ô chọn hiện TÊN ("Thành phố Hà Nội"). Hai thứ
 * khác nhau, nên phải có chỗ chuyển.
 *
 * ❌ Cách bản năng: để nơi gọi truyền `value={selectedLabel}` từ một state
 * riêng. Hỏng thật ở đúng ba nhịp mà form nào cũng có — `reset()`,
 * `setValue()`, và điền lại dữ liệu từ máy chủ: form đổi mã, state hiển thị thì
 * không, và ô chọn hiện TÊN CŨ trong khi dữ liệu gửi đi là mã MỚI. Người dùng
 * đọc lại màn xác nhận thấy đúng, backend nhận sai.
 *
 * ✅ `format` suy chữ hiển thị TỪ chính giá trị của form, nên không có nguồn sự
 * thật thứ hai để lệch. Bỏ trống thì hiện thẳng giá trị (đủ dùng cho trường mà
 * mã cũng chính là chữ hiển thị).
 *
 * @example
 *   <FormSelect
 *     control={form.control}
 *     format={(code) => PROVINCES.find((p) => p.value === code)?.label ?? ''}
 *     label="Tỉnh/Thành"
 *     name="provinceCode"
 *     required
 *     onPress={() => setOpen(true)}
 *   />
 */
export interface FormSelectProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues> = FieldPath<TValues>,
> extends Omit<SelectProps, 'value'> {
  control: Control<TValues>;
  /**
   * Đổi giá trị trong form thành chữ hiển thị.
   *
   * ⚠️ BẮT BUỘC khi trường giữ một object (`{ code, name }`): không có nó thì
   * `String(value)` cho ra "[object Object]" ngay trên ô chọn — `tsc` không đỏ
   * vì `String()` nhận mọi thứ.
   */
  format?: (value: FieldPathValue<TValues, TName>) => string;
  name: TName;
}

/** Rỗng/`null`/chuỗi rỗng ⇒ `undefined` để `Select` rơi về placeholder. */
function toDisplay(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
}

export function FormSelect<
  TValues extends FieldValues,
  TName extends FieldPath<TValues> = FieldPath<TValues>,
>({
  control,
  format,
  message,
  /**
   * ⚠️ Mặc định `hint`, KHÁC với `Select` trần (mặc định `error`) — giống hệt
   * cách `FormInput` làm. Ở đây `message` chỉ còn là dòng chú thích tĩnh ("Địa
   * chỉ trên hoá đơn"); phần lỗi đã do `fieldState` lo, và nó tự đặt tông
   * `error` khi có lỗi.
   */
  messageTone = 'hint',
  name,
  ...selectProps
}: FormSelectProps<TValues, TName>) {
  return (
    <Controller<TValues, TName>
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const error = fieldState.error?.message;

        return (
          <Select
            {...selectProps}
            message={error ?? message}
            messageTone={error === undefined ? messageTone : 'error'}
            value={format ? format(field.value) : toDisplay(field.value)}
          />
        );
      }}
    />
  );
}
