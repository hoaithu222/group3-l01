/**
 * @file HudInfoBox.tsx
 * @description Khung khối kiểu HUD (kit2) — vát góc TL+BR, bracket [ ] 2 góc còn
 * lại, viền gradient sáng ở góc TL nhạt dần, quầng sáng theo tone. Header tuỳ chọn
 * (chip icon + title + slot phải) trên nền tint, gạch ngăn, rồi thân `children`.
 *
 * Màu viền/accent đổi qua prop `tone` (token base: 'sky' | 'primary' | 'success' |
 * 'warning' | 'error' | 'info' | 'neutral'… → dùng scale `-5`). Hỗ trợ `onClick` +
 * `selected` để dùng như card chọn được.
 *
 * ⚠️ Viền vẽ 2 LỚP (lớp ngoài tô màu, lớp ruột thụt 1px `p-px`) vì `border` CSS
 * không chạy theo `clip-path`. Ruột dùng nền ĐỤC (color-mix trộn với `bg-1`).
 */
import { memo, type CSSProperties, type ReactNode } from 'react';

import { cn } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import type { SystemIconName } from '@/shared/ui/icons';

export interface HudInfoBoxProps {
  /** Token base màu viền/accent — dùng scale `-5`. Default `sky`. */
  tone?: string;
  /** Icon chip bên trái header. */
  icon?: SystemIconName;
  /** Tiêu đề header (string hoặc node tuỳ biến). Bỏ trống + không icon → ẩn header. */
  title?: ReactNode;
  /** Slot phải header (badge, action…). */
  headerRight?: ReactNode;
  /** Nội dung thân. */
  children: ReactNode;
  /** Click cả khung → khung thành card chọn được (role button). */
  onClick?: () => void;
  /** Đang chọn — nhấn viền + tint nền. */
  selected?: boolean;
  /** Class cho root. */
  className?: string;
  /** Class cho vùng thân (mặc định `p-2`). */
  bodyClassName?: string;
  /**
   * Style của MẶT thẻ (lớp ruột, nằm dưới cả header lẫn thân) — để phủ gradient
   * cho mặt thẻ không phẳng lì. Cùng vai trò `bodyStyle` của `HudFrame`.
   *
   * Dùng `style` chứ không `bodyClassName` vì dốc màu phải tính bằng `color-mix`
   * trên nền THẬT của panel — class Tailwind tĩnh không diễn đạt được. Đè lên
   * `background` mặc định, nên truyền vào là tự lo luôn phần nền của trạng thái
   * `selected`.
   */
  bodyStyle?: CSSProperties;
}

/** Cỡ vát góc — khớp `HudFrame` (12px) cho khung cỡ card. */
const NOTCH = 12;
const CLIP = `polygon(${NOTCH}px 0, 100% 0, 100% calc(100% - ${NOTCH}px), calc(100% - ${NOTCH}px) 100%, 0 100%, 0 ${NOTCH}px)`;

/** Chip icon vát góc cùng chiều — 4px cho ô ~20px. */
const CHIP_NOTCH = 4;
const CHIP_CLIP = `polygon(${CHIP_NOTCH}px 0, 100% 0, 100% calc(100% - ${CHIP_NOTCH}px), calc(100% - ${CHIP_NOTCH}px) 100%, 0 100%, 0 ${CHIP_NOTCH}px)`;

const mix = (tone: string, pct: number, over = 'transparent') =>
  `color-mix(in srgb, var(--color-${tone}-5) ${pct}%, ${over})`;

/** Viền: sáng ở góc TL (tone) → nhạt dần về BR (`border-1`). Selected → sáng hơn. */
const edgePaint = (tone: string, on: boolean) =>
  `linear-gradient(150deg, ${mix(tone, on ? 95 : 78)} 0%, ${mix(tone, on ? 46 : 28)} 32%, var(--color-border-1) 72%)`;

/** Header tint — đậm dần về phải, pha tone nhạt. */
const headerPaint = (tone: string) => `linear-gradient(to left, transparent, ${mix(tone, 16)})`;

/** Gạch ngăn tiêu đề — đậm mép trái rồi tắt hẳn. */
const dividerPaint = (tone: string) =>
  `linear-gradient(90deg, ${mix(tone, 55)} 0%, ${mix(tone, 14)} 45%, transparent 100%)`;

const HudInfoBox = memo(function HudInfoBox({
  tone = 'sky',
  icon,
  title,
  headerRight,
  children,
  onClick,
  selected = false,
  className,
  bodyClassName,
  bodyStyle,
}: HudInfoBoxProps) {
  const bracket = `var(--color-${tone}-5)`;
  const hasHeader = !!icon || title != null || headerRight != null;
  const interactive = !!onClick;

  return (
    <div
      aria-pressed={interactive ? selected : undefined}
      className={cn(
        'group relative p-px transition-shadow',
        interactive && 'cursor-pointer',
        className,
      )}
      role={interactive ? 'button' : undefined}
      style={{
        clipPath: CLIP,
        background: edgePaint(tone, selected),
        boxShadow: `0 0 ${selected ? 22 : 16}px -12px ${bracket}`,
      }}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
    >
      <div
        className="flex h-full min-w-0 flex-col overflow-hidden"
        style={{
          clipPath: CLIP,
          background: selected ? mix(tone, 10, 'var(--color-bg-1)') : 'var(--color-bg-1)',
          ...bodyStyle,
        }}
      >
        {hasHeader && (
          <>
            <div
              className="flex min-w-0 shrink-0 items-center gap-2 px-2.5 py-2"
              style={{ background: headerPaint(tone) }}
            >
              {icon && (
                <span
                  className="flex shrink-0 items-center p-1"
                  style={{ clipPath: CHIP_CLIP, background: mix(tone, 28), color: bracket }}
                >
                  <SystemIcon name={icon} size={14} />
                </span>
              )}
              {title != null && (
                <div className="flex min-w-0 flex-1 items-center gap-2">{title}</div>
              )}
              {headerRight != null && (
                <div className="flex shrink-0 items-center">{headerRight}</div>
              )}
            </div>
            <span
              aria-hidden
              className="h-px w-full shrink-0"
              style={{ background: dividerPaint(tone) }}
            />
          </>
        )}

        <div className={cn('min-w-0 flex-1', bodyClassName ?? 'p-2')}>{children}</div>
      </div>

      {/* Bracket [ ] ở 2 góc KHÔNG bị vát — cùng pattern `HudFrame`. */}
      <span
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 z-20 size-2 border-r-[1.5px] border-t-[1.5px]"
        style={{ borderColor: bracket }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 z-20 size-2 border-b-[1.5px] border-l-[1.5px]"
        style={{ borderColor: bracket }}
      />
    </div>
  );
});

HudInfoBox.displayName = 'HudInfoBox';

export default HudInfoBox;
