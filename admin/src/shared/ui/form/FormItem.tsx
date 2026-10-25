import { cn } from '@/shared/utils/style/cn';

export type ErrorColor = 'error' | 'warning' | 'success' | 'link';

const ERROR_COLOR_CLASS: Record<ErrorColor, string> = {
  error: 'text-error',
  warning: 'text-warning',
  success: 'text-success',
  link: 'text-link',
};

export interface FormItemProps {
  label?: string;
  required?: boolean;
  /** Show "(Tùy chọn)" hint after label. Ignored when `required`. */
  optional?: boolean;
  /** Custom optional label text. Default: "(Tùy chọn)". */
  optionalLabel?: string;
  description?: string;
  error?: string;
  /** Color token for error message + required asterisk. Default: 'error'. */
  errorColor?: ErrorColor;
  children: React.ReactNode;
  className?: string;
  /** id của control — dùng cho `<label htmlFor>` khi control là `<input>` thật. */
  htmlFor?: string;
  /**
   * id gắn lên chính `<label>`. Control KHÔNG phải ô nhập thật (button /
   * combobox / switch) trỏ `aria-labelledby` về đây thay cho `htmlFor`.
   */
  labelId?: string;
  /** id của dòng mô tả — control trỏ `aria-describedby` về đây. */
  descriptionId?: string;
  /** id của dòng lỗi — control trỏ `aria-describedby` về đây. */
  errorId?: string;
}

/**
 * Wraps a field slot with label, description, and error message.
 * Use this when you need a custom input not covered by the pre-wired *Field components.
 *
 * ── Message slot: CHIỀU CAO CỐ ĐỊNH ─────────────────────────────────────────
 * Bản cũ chỉ render `<p>` khi CÓ description/error ⇒ lúc validate bắn lỗi, hàng
 * cao thêm ~22px (6px gap + 16px dòng chữ) và TOÀN BỘ form nhảy xuống — người
 * dùng mất chỗ đang gõ. Nay slot LUÔN được render với `min-h-4` (16px =
 * line-height của `caption-12`), nên bật/tắt lỗi không đổi chiều cao hàng.
 *
 * Description và error DÙNG CHUNG một slot (không xếp chồng — xếp chồng là làm
 * hàng cao thêm lần nữa). Khi có lỗi, lỗi chiếm chỗ hiển thị, còn description
 * lùi về `sr-only` để screen reader VẪN đọc được gợi ý — đúng lúc người dùng
 * cần nó nhất.
 *
 * ── Trợ năng: id phải do FIELD cấp ──────────────────────────────────────────
 * `htmlFor` / `labelId` / `descriptionId` / `errorId` đều nhận từ ngoài chứ
 * KHÔNG tự sinh: control nằm ở `children`, chỉ field mới gắn được id lên nó, nên
 * hai bên buộc phải lấy id từ cùng một nguồn (`useFieldA11y`). Bỏ trống thì
 * FormItem vẫn chạy y như cũ (dùng cho ô read-only, nơi không có control nào).
 */
function FormItem({
  label,
  required,
  optional,
  optionalLabel = '(Tùy chọn)',
  description,
  error,
  errorColor = 'error',
  children,
  className,
  htmlFor,
  labelId,
  descriptionId,
  errorId,
}: FormItemProps) {
  const colorClass = ERROR_COLOR_CLASS[errorColor];

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label
          className="text-body-14-medium text-fg-1 flex items-center gap-1"
          htmlFor={htmlFor}
          id={labelId}
        >
          <span>{label}</span>
          {required && (
            // `leading-none` bóp line-box của dấu * về đúng cỡ glyph rồi
            // `translate-y-px` hạ nhẹ — nếu không, glyph `*` nằm sát mép trên
            // line-box 20px và trông như dính vào chữ. `select-none` để bôi đen
            // nhãn không kéo theo dấu sao.
            <span
              aria-hidden
              className={cn('translate-y-px leading-none font-semibold select-none', colorClass)}
            >
              *
            </span>
          )}
          {!required && optional && (
            <span className="text-caption-12 text-fg-4 ml-0.5">{optionalLabel}</span>
          )}
        </label>
      )}

      {children}

      {error ? (
        <div className="min-h-4">
          <p className={cn('text-caption-12', colorClass)} id={errorId} role="alert">
            {error}
          </p>
          {description && (
            <span className="sr-only" id={descriptionId}>
              {description}
            </span>
          )}
        </div>
      ) : (
        description && (
          <p className="text-caption-12 text-fg-4" id={descriptionId}>
            {description}
          </p>
        )
      )}
    </div>
  );
}

export default FormItem;
