import { cn } from '@/shared/utils/style/cn';
import Button from '@/shared/ui/actions/Button';

export interface FormActionsProps {
  /** Custom content — replaces the auto-generated button row when provided. */
  children?: React.ReactNode;
  onCancel?: () => void;
  cancelLabel?: string;
  submitLabel?: string;
  /** Pass form.formState.isSubmitting to show loading spinner. */
  isSubmitting?: boolean;
  /** Sticks to the bottom of a scrollable form. */
  sticky?: boolean;
  className?: string;
}

/**
 * Footer row with Cancel + Submit buttons.
 * `sticky` pins it to the bottom of a scrollable container with a glass divider.
 *
 * Buttons render ở `size="md"` (h-9) — KHỚP với footer của `FormModal`
 * (`buttonSize` mặc định `md`). Trước đây là `lg` (h-10) nên cùng một form mở
 * inline và mở trong modal cho ra hai cỡ nút khác nhau. Default `xl` của
 * `<Button>` giữ nguyên, không đụng tới.
 */
function FormActions({
  children,
  onCancel,
  cancelLabel = 'Hủy bỏ',
  submitLabel = 'Xác nhận',
  isSubmitting = false,
  sticky = false,
  className,
}: FormActionsProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-3 pt-4',
        sticky && [
          'sticky bottom-0 z-10 py-4 mt-auto',
          'border-t border-divider-1',
          'bg-bg-dialog/80 backdrop-blur-sm',
        ],
        className,
      )}
    >
      {children ?? (
        <>
          {onCancel && (
            <Button size="md" skin="neutral" type="button" variant="secondary" onClick={onCancel}>
              {cancelLabel}
            </Button>
          )}
          <Button loading={isSubmitting} size="md" type="submit">
            {submitLabel}
          </Button>
        </>
      )}
    </div>
  );
}

export default FormActions;
