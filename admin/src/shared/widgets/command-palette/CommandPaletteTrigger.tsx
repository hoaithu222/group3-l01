/**
 * CommandPaletteTrigger — nút icon mở Command Palette, đặt vào slot `actions`
 * của `<Header>` (xem `AppHeader.tsx`).
 *
 * Cùng khuôn với `ThemeToggle`: icon-only, `className` do nơi gọi truyền vào
 * để khớp `HEADER_ICON_BUTTON_CLASS` — bản thân component không tự cho rằng
 * mình luôn nằm trong header (dùng lại được ở showcase).
 */
import { memo } from 'react';
import { tv } from 'tailwind-variants';

import { Tooltip } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import { useCommandPaletteStore } from './command-palette-store';

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

export interface CommandPaletteTriggerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showTooltip?: boolean;
}

const CommandPaletteTrigger = memo(function CommandPaletteTrigger({
  size,
  className,
  showTooltip = true,
}: CommandPaletteTriggerProps) {
  const open = useCommandPaletteStore((state) => state.open);

  const button = (
    <button
      aria-label="Tìm nhanh"
      className={styles({ size, class: className })}
      type="button"
      onClick={open}
    >
      <SystemIcon name="magnifying-glass-outline" />
    </button>
  );

  if (!showTooltip) return button;

  return (
    <Tooltip arrow={false} content="Tìm nhanh (Ctrl K)" side="bottom">
      {button}
    </Tooltip>
  );
});

export default CommandPaletteTrigger;
