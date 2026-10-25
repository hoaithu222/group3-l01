/**
 * ThemeToggle — nút đổi giữa chế độ sáng và tối.
 *
 * ⛔ ĐIỀU KHIỂN TỪ NGOÀI (controlled). Kit2 KHÔNG được đọc `@/app/store`: cái
 * gì trong `shared/` mà biết tới `app/` thì lôi cả cây store vào mọi nơi dùng
 * design system — showcase, test, và dự án có hình dạng store khác đều gãy.
 * Tầng `app/shell/` là nơi nối với store (xem `AppHeader.tsx`).
 *
 * Mặc định render dạng nút icon (ghost) — hợp slot Header, thanh công cụ.
 */
import { memo } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';

import { SystemIcon } from '@/shared/ui/icons/Icons';
import Tooltip from '@/shared/ui/overlays/Tooltip';

const styles = tv({
  base: [
    'inline-flex shrink-0 items-center justify-center',
    'outline-none cursor-pointer',
    'transition-colors duration-200',
    'text-fg-on-nav-muted hover:text-fg-on-nav',
    'hover:bg-nav-hover-bg',
    'focus-visible:ring-2 focus-visible:ring-ring-focus/60',
  ],
  variants: {
    size: {
      sm: 'size-8 [&>svg]:size-4',
      md: 'size-9 [&>svg]:size-[18px]',
      lg: 'size-11 [&>svg]:size-[22px]',
    },
  },
  defaultVariants: { size: 'md' },
});

type ThemeToggleVariants = VariantProps<typeof styles>;
export type ThemeToggleSize = NonNullable<ThemeToggleVariants['size']>;

export interface ThemeToggleProps extends ThemeToggleVariants {
  /** Chế độ đang bật — quyết định icon và nhãn trợ năng. */
  theme: 'light' | 'dark';
  /** Bấm nút. Nơi gọi tự quyết định lật sang chế độ nào. */
  onToggle: () => void;
  className?: string;
  /** Hiển thị tooltip mô tả khi hover. Default `true`. */
  showTooltip?: boolean;
}

const ThemeToggle = memo(function ThemeToggle({
  theme,
  onToggle,
  size,
  className,
  showTooltip = true,
}: ThemeToggleProps) {
  const isDark = theme === 'dark';

  const button = (
    <button
      aria-label={isDark ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
      aria-pressed={isDark}
      className={styles({ size, class: className })}
      type="button"
      onClick={onToggle}
    >
      <SystemIcon name={isDark ? 'sun-bold' : 'moon-bold'} />
    </button>
  );

  if (!showTooltip) return button;

  return (
    <Tooltip arrow={false} content={isDark ? 'Chế độ sáng' : 'Chế độ tối'} side="bottom">
      {button}
    </Tooltip>
  );
});

export default ThemeToggle;
