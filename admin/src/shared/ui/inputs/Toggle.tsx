import * as SwitchPrimitive from '@radix-ui/react-switch';
import { tv } from 'tailwind-variants';
import { cn, twMergeFontExtend } from '@/shared/utils/style/cn';

/**
 * Toggle — kit2 switch built on Radix Switch primitive.
 *
 * Figma 612:6895:
 *   - Checked: bg-primary-6 + 5px brand glow
 *   - Unchecked: bg-neutral-7
 *   - Thumb: white (neutral-0) + Shadow/md elevation
 *
 * ── Vì sao `primary-6` chứ không `green-6` ──────────────────────────────────
 * `green-6` là màu STATUS (success), không phải accent brand — dùng nó ở đây
 * làm toggle "bật" trông như một badge trạng thái và lệch khỏi Checkbox/Radio.
 * Cả ba control nay dùng chung: nền `primary-6` + dấu/thumb `neutral-0` + ring
 * focus `primary-5/40`.
 *
 * Usage:
 *   <Toggle checked={on} onCheckedChange={setOn} />
 *   <Toggle label="Notifications" defaultChecked />
 */
export type ToggleSize = 'sm' | 'md' | 'lg';

const styles = tv(
  {
    slots: {
      wrapper: 'inline-flex items-center gap-2',
      root: [
        'relative inline-flex shrink-0 cursor-pointer items-center',
        'rounded-full border-2 border-transparent',
        'transition-colors duration-200 outline-none',
        'data-[state=unchecked]:bg-neutral-7',
        'data-[state=checked]:bg-primary-6',
        'data-[state=checked]:drop-shadow-[0_0_5px_var(--color-primary-6)]',
        'focus-visible:ring-1 focus-visible:ring-primary-5/25',
        'disabled:cursor-not-allowed disabled:opacity-50',
      ],
      thumb: [
        'pointer-events-none block rounded-full bg-neutral-0 shadow-sm',
        'transition-transform duration-200',
        'data-[state=unchecked]:translate-x-0',
      ],
      label: 'select-none cursor-pointer',
    },
    variants: {
      size: {
        sm: {
          root: 'h-4 w-7',
          thumb: 'size-3 data-[state=checked]:translate-x-3',
        },
        md: {
          root: 'h-5 w-9',
          thumb: 'size-4 data-[state=checked]:translate-x-4',
        },
        lg: {
          root: 'h-6 w-11',
          thumb: 'size-5 data-[state=checked]:translate-x-5',
        },
      },
    },
  },
  { twMergeConfig: twMergeFontExtend },
);

export interface ToggleProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
  labelPosition?: 'left' | 'right';
  size?: ToggleSize;
  disabled?: boolean;
  className?: string;
  id?: string;
  /**
   * Tên trợ năng khi KHÔNG truyền `label` — công tắc đứng một mình trong ô bảng
   * (nhãn nằm ở tiêu đề cột) thì trình đọc màn hình chỉ đọc được "switch, on",
   * không biết đang bật/tắt cái gì. Có `label` thì bỏ trống prop này.
   */
  'aria-label'?: string;
  /** Trỏ tới id của phần tử đang làm nhãn — thay cho `aria-label` khi nhãn đã hiện trên màn. */
  'aria-labelledby'?: string;
  /** id của dòng mô tả / dòng lỗi đi kèm — trình đọc màn hình đọc sau tên. */
  'aria-describedby'?: string;
  /** Công tắc đang ở giá trị không hợp lệ (form báo lỗi). */
  'aria-invalid'?: boolean;
  /**
   * Trỏ tới chính `<button role="switch">`. Cần cho việc focus bằng mã và cho
   * điều hướng bàn phím giữa các ô nhập — 5 ô nhập còn lại trong nhóm này đều
   * chuyển tiếp ref, thiếu ở đây là một bất đối xứng khó đoán.
   */
  ref?: React.Ref<HTMLButtonElement>;
}

function Toggle({
  checked,
  defaultChecked,
  onCheckedChange,
  label,
  labelPosition = 'right',
  size = 'md',
  disabled,
  className,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  ref,
}: ToggleProps) {
  const slots = styles({ size });

  const switchEl = (
    <SwitchPrimitive.Root
      ref={ref}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      checked={checked}
      className={slots.root({ class: label ? undefined : className })}
      defaultChecked={defaultChecked}
      disabled={disabled}
      id={id}
      onCheckedChange={onCheckedChange}
    >
      <SwitchPrimitive.Thumb className={slots.thumb()} />
    </SwitchPrimitive.Root>
  );

  if (!label) return switchEl;

  return (
    <label
      className={slots.wrapper({ class: className })}
      // ⛔ `<label>` bọc thẳng nút switch (KHÔNG có htmlFor/id) → bấm vào chính nút
      // sẽ kích hoạt 2 lần: một lần của nút, một lần do label chuyển tiếp. Toggle
      // lật rồi lật lại → nhìn như "bấm không ăn". Bấm vào CHỮ vẫn chuyển tiếp
      // bình thường vì lúc đó target không nằm trong nút.
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('[role="switch"]')) event.preventDefault();
      }}
    >
      {labelPosition === 'left' && (
        <span className={cn(slots.label(), 'text-body-13 text-fg-2')}>{label}</span>
      )}
      {switchEl}
      {labelPosition === 'right' && (
        <span className={cn(slots.label(), 'text-body-13 text-fg-2')}>{label}</span>
      )}
    </label>
  );
}

export default Toggle;
