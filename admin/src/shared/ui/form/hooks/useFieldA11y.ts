import { useId } from 'react';

/**
 * Nối NHÃN ↔ Ô NHẬP cho một field của kit2 form.
 *
 * ── Vì sao cần ──────────────────────────────────────────────────────────────
 * `<FormItem>` vẽ `<label>`, còn control (Input / Dropdown / Toggle…) do từng
 * field tự dựng — hai bên không hề biết id của nhau. Hậu quả đo được:
 *   - Trình đọc màn hình đọc ra "edit text" TRỐNG, không biết ô đó là gì.
 *   - Bấm vào nhãn KHÔNG nhảy con trỏ vào ô (hành vi native của `<label for>`).
 *   - `getByLabelText()` của Testing Library không tìm ra ô ⇒ test phải đi
 *     đường vòng qua placeholder.
 *
 * Hook sinh id ổn định bằng `useId()` (khớp giữa các lần render, không đụng
 * nhau khi cùng một field xuất hiện nhiều bản trong `FieldArray`) rồi phát ra
 * ba cụm props dùng thẳng — field không phải tự bịa id, không phải nhớ thứ tự
 * `aria-describedby`.
 */

interface UseFieldA11yOptions {
  /** Nhãn hiển thị. Không có nhãn thì KHÔNG phát `aria-labelledby` (trỏ vào
   *  phần tử không tồn tại sẽ XOÁ TRẮNG tên trợ năng, tệ hơn là bỏ trống). */
  label?: React.ReactNode;
  description?: string;
  error?: string;
}

/** Ids cho `<FormItem>` gắn lên label / mô tả / thông báo lỗi. */
export interface FieldItemA11y {
  labelId: string;
  descriptionId: string;
  errorId: string;
}

/** Props cho control là `<input>` / `<textarea>` THẬT — nhãn nối bằng `htmlFor`. */
export interface FieldInputA11y {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

/**
 * Props cho control KHÔNG phải ô nhập thật (`<button role="combobox">` của
 * Radix, switch, trigger popover). `<label htmlFor>` không phải cách trình đọc
 * màn hình mong đợi ở nhóm này, nên tên đi qua `aria-labelledby`.
 */
export interface FieldTriggerA11y extends FieldInputA11y {
  'aria-labelledby'?: string;
}

export interface FieldA11y {
  /** id của control — truyền vào `<FormItem htmlFor>` khi control là input thật. */
  id: string;
  item: FieldItemA11y;
  input: FieldInputA11y;
  trigger: FieldTriggerA11y;
}

export function useFieldA11y({ label, description, error }: UseFieldA11yOptions = {}): FieldA11y {
  const uid = useId();

  const id = `${uid}field`;
  const labelId = `${uid}label`;
  const descriptionId = `${uid}desc`;
  const errorId = `${uid}error`;

  // Lỗi đứng TRƯỚC mô tả: trình đọc màn hình đọc theo đúng thứ tự này, mà lúc
  // đang sai thì thứ người dùng cần nghe trước là sai ở đâu.
  const describedBy =
    [error ? errorId : null, description ? descriptionId : null].filter(Boolean).join(' ') ||
    undefined;

  const input: FieldInputA11y = {
    id,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
  };

  return {
    id,
    item: { labelId, descriptionId, errorId },
    input,
    trigger: { ...input, 'aria-labelledby': label ? labelId : undefined },
  };
}
