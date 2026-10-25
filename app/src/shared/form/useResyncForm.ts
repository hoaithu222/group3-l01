import { useEffect, useRef } from 'react';
import { useFormState, type FieldValues, type UseFormReturn } from 'react-hook-form';

/** So nông hai object phẳng (giá trị form cài đặt: chuỗi/số/boolean). */
function sameValues(a: FieldValues, b: FieldValues): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (!Object.is(a[key], b[key])) return false;
  return true;
}

/**
 * Nạp lại form theo bản SERVER mới nhất khi người dùng CHƯA sửa gì — cùng luật `MeetingFormScreen`.
 *
 * ⚠️ Vì sao cần: `defaultValues` của react-hook-form chỉ được đọc MỘT lần lúc dựng form. Màn cài đặt mở từ cache rồi tải
 * lại nền (hoặc socket vá tên mới từ máy khác) ⇒ dữ liệu đã đổi nhưng ô nhập vẫn hiện giá trị CŨ, và bấm "Lưu" là ghi
 * đè thay đổi của người khác bằng dữ liệu cũ. Đang có chỗ đã sửa (`isDirty`) thì GIỮ nguyên — lưu sẽ gặp 409
 * (`expectedVersion`) và được báo. Ngoại lệ: giá trị form đã TRÙNG bản server (vừa lưu xong chính nó) ⇒ nạp lại để
 * xoá cờ "đã sửa", không thì từ đó về sau form không bao giờ đồng bộ lại nữa.
 *
 * `revision` là thứ đổi khi bản server đổi (thường là `version`). `values` đọc qua ref nên nơi gọi không cần memo.
 */
export function useResyncForm<TInput extends FieldValues, TOutput extends FieldValues>(
  form: UseFormReturn<TInput, unknown, TOutput>,
  values: TInput,
  revision: number | string,
): void {
  const { isDirty } = useFormState({ control: form.control });
  const { getValues, reset } = form;
  const valuesRef = useRef(values);
  const syncedRevision = useRef(revision);

  // ⛔ Ghi ref trong effect, không trong lúc render (`react-hooks/refs`). Effect này khai TRƯỚC nên chạy trước effect dưới.
  useEffect(() => {
    valuesRef.current = values;
  });

  useEffect(() => {
    if (syncedRevision.current === revision) return;
    if (isDirty && !sameValues(getValues(), valuesRef.current)) return;
    syncedRevision.current = revision;
    reset(valuesRef.current);
  }, [getValues, isDirty, reset, revision]);
}
