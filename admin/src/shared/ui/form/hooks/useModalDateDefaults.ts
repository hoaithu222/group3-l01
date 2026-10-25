import { useEffect, useRef } from 'react';
import dayjs from 'dayjs';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

interface UseModalDateDefaultsOptions<T extends FieldValues> {
  form: UseFormReturn<T>;
  open: boolean;
  fields: Path<T>[];
  value?: 'today' | Date | string;
  format?: string;
}

/**
 * Fill empty date fields with a default value each time the modal transitions
 * from closed to open. Chỉ set khi giá trị hiện tại rỗng — không đè lên ngày
 * user đã sửa hay defaultValues truyền vào (edit mode).
 *
 * Dùng cho form "thêm mới" có DatePicker (start/end date) → user không phải
 * click vào picker rồi chọn hôm nay bằng tay. Nếu form là edit → truyền
 * defaultValues chứa ngày cũ, hook sẽ bỏ qua (vì giá trị đã có).
 *
 * Chạy sau reset. Đặt trong modal component sau `form.reset(...)` trong effect.
 */
export function useModalDateDefaults<T extends FieldValues>({
  form,
  open,
  fields,
  value = 'today',
  format = 'YYYY-MM-DD',
}: UseModalDateDefaultsOptions<T>) {
  const prevOpen = useRef(false);

  useEffect(() => {
    if (!open) {
      prevOpen.current = false;
      return;
    }
    // Chỉ chạy khi mở lên (transition false → true) hoặc mount lần đầu ở
    // trạng thái open. Tránh chạy lại khi user click chọn ngày rồi form
    // re-render.
    if (prevOpen.current) return;
    prevOpen.current = true;

    const resolved =
      value === 'today'
        ? dayjs().format(format)
        : value instanceof Date
          ? dayjs(value).format(format)
          : value;

    fields.forEach((field) => {
      const current = form.getValues(field);
      if (current == null || current === '') {
        form.setValue(field, resolved as never, {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: false,
        });
      }
    });
    // fields/value/format hiếm khi đổi động; form không cần trong deps để
    // tránh trigger thừa. `open` là mấu chốt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
