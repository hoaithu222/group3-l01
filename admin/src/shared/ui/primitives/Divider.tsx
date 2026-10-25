import { tv } from 'tailwind-variants';
import { twMergeFontExtend } from '@/shared/utils/style/cn';

/**
 * Divider — horizontal or vertical separator with optional center label.
 *
 * Usage:
 *   <Divider />
 *   <Divider variant="dashed" />
 *   <Divider orientation="vertical" />
 *   <Divider>or</Divider>      // label only meaningful when horizontal
 */
export type DividerOrientation = 'horizontal' | 'vertical';
export type DividerVariant = 'solid' | 'dashed' | 'dotted';

const styles = tv(
  {
    slots: {
      container: 'flex items-center gap-3 w-full',
      line: 'flex-1 border-divider-1',
      label: 'text-caption-12 text-fg-4 whitespace-nowrap',
      plain: 'border-divider-2',
    },
    variants: {
      orientation: {
        horizontal: {
          plain: 'w-full border-t',
          line: 'border-t',
        },
        vertical: {
          // KHÔNG dùng `h-full` (height:100%) — parent flex thường cao auto nên
          // bị collapse về 0. `self-stretch` co giãn theo chiều cao hàng; nếu
          // consumer truyền `h-*` thì chiều cao cố định đó được áp dụng.
          plain: 'self-stretch border-l',
          line: 'border-l self-stretch',
        },
      },
      variant: {
        solid: { plain: 'border-solid', line: 'border-solid' },
        dashed: { plain: 'border-dashed', line: 'border-dashed' },
        dotted: { plain: 'border-dotted', line: 'border-dotted' },
      },
    },
  },
  { twMergeConfig: twMergeFontExtend },
);

export interface DividerProps {
  orientation?: DividerOrientation;
  variant?: DividerVariant;
  /** Center label (rendered only when horizontal). */
  children?: React.ReactNode;
  className?: string;
}

function Divider({
  orientation = 'horizontal',
  variant = 'solid',
  children,
  className,
}: DividerProps) {
  const slots = styles({ orientation, variant });

  if (children && orientation === 'horizontal') {
    return (
      <div
        aria-orientation="horizontal"
        className={slots.container({ class: className })}
        role="separator"
      >
        <div className={slots.line()} />
        <span className={slots.label()}>{children}</span>
        <div className={slots.line()} />
      </div>
    );
  }

  return (
    <div
      aria-orientation={orientation}
      className={slots.plain({ class: className })}
      role="separator"
    />
  );
}

export default Divider;
