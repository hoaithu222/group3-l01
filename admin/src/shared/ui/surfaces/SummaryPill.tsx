/**
 * SummaryPill — compact KPI pill dùng trong page header (kit2).
 *
 * Figma: PMS-NEW node 10144-454330 (Summary/S), used in strip 10144-454326
 * và variant thành viên 9769-309709.
 *
 * Layout (left → right, all inline):
 *   ┌─                            ─┐
 *    [icon]  Label   Value  (hint?)
 *   └─                            ─┘
 *
 * Ornament: vát góc TL + BR (notch 6px) + 2 L-shaped bracket ở TR + BL theo
 * tone màu — cùng ngôn ngữ hình khối với `HudFrame` / `TitleScreen` (BigDataView).
 * KHÔNG dùng left-border 2px như phiên bản trước.
 *
 * ⚠️ `icon` MUST be a `-bold` variant — enforced via BoldSystemIconName.
 * Value uses `tabular-nums` (per visual-hierarchy §3.3).
 */

import type { ReactNode } from 'react';
import { memo } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';
import { cn, twMergeFontExtend } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import type { BoldSystemIconName } from './SummaryCard';
import AnimatedNumber from '../data-display/AnimatedNumber';

// ── Recipe ─────────────────────────────────────────────────────────────────────

const summaryPillStyles = tv(
  {
    slots: {
      root: cn(
        'relative inline-flex items-center whitespace-nowrap backdrop-blur-[5px]',
        'transition-shadow duration-200',
      ),
      // Corner bracket base — border-color = tone-5 set by variant.
      corner: 'pointer-events-none absolute size-2 border-transparent',
      icon: 'shrink-0',
      label: 'shrink-0',
      value: 'text-fg-1 tabular-nums',
      hint: 'text-fg-4',
    },
    /**
     * Color mapping theo Figma vars (BG `-6/20..30`, icon/bracket `-5`), NHƯNG nhãn
     * phải khai bậc đôi `-8` (theme sáng) / `-2` (theme tối).
     *
     * ⛔ Bản cũ để nhãn ở `-2` cho cả hai theme. Nền pill là màu PHA (`-6/20..30`)
     * nên nó lật theo theme, còn `-2` thì gần trắng ở cả hai → ở theme SÁNG toàn
     * bộ 11 tone chỉ đạt tỉ số tương phản 1.02–1.14, tức nhãn biến mất hoàn toàn
     * (`text-contrast.md §1` yêu cầu ≥ 4.5). Bậc `-8` đưa cả 11 tone về 4.72–8.66.
     *
     * `sky` dùng họ `primary` (Figma legacy naming — pill này ra màu XANH LÁ, muốn
     * xanh dương thì dùng `blue`); nhãn đã kéo về cùng họ `primary` thay vì
     * `secondary` để icon/bracket/nhãn không còn lệch 3 họ màu.
     * `pink` cố ý trộn pink text + fuchsia bg — theo Figma node 10144-454332.
     */
    variants: {
      color: {
        sky: {
          root: 'bg-primary-6/30',
          icon: 'text-primary-5',
          label: 'text-primary-8 dark:text-primary-2',
          corner: 'border-primary-5',
        },
        green: {
          root: 'bg-success-6/30',
          icon: 'text-success-5',
          label: 'text-success-8 dark:text-success-2',
          corner: 'border-success-5',
        },
        yellow: {
          root: 'bg-accent-6/30',
          icon: 'text-accent-5',
          label: 'text-accent-8 dark:text-accent-2',
          corner: 'border-accent-5',
        },
        orange: {
          root: 'bg-orange-6/20',
          icon: 'text-orange-5',
          label: 'text-orange-8 dark:text-orange-2',
          corner: 'border-orange-5',
        },
        indigo: {
          root: 'bg-indigo-6/30',
          icon: 'text-indigo-5',
          label: 'text-indigo-8 dark:text-indigo-2',
          corner: 'border-indigo-5',
        },
        pink: {
          // Figma: BG/Fuchsia + Pink/5 + Pink/2 (mixed tone by design).
          root: 'bg-fuchsia-6/20',
          icon: 'text-pink-5',
          label: 'text-pink-8 dark:text-pink-2',
          corner: 'border-pink-5',
        },
        fuchsia: {
          root: 'bg-fuchsia-6/20',
          icon: 'text-fuchsia-5',
          label: 'text-fuchsia-8 dark:text-fuchsia-2',
          corner: 'border-fuchsia-5',
        },
        purple: {
          root: 'bg-purple-6/20',
          icon: 'text-purple-5',
          label: 'text-purple-8 dark:text-purple-2',
          corner: 'border-purple-5',
        },
        blue: {
          root: 'bg-blue-6/20',
          icon: 'text-blue-5',
          label: 'text-blue-8 dark:text-blue-2',
          corner: 'border-blue-5',
        },
        red: {
          root: 'bg-error-6/30',
          icon: 'text-error-5',
          label: 'text-error-8 dark:text-error-2',
          corner: 'border-error-5',
        },
        teal: {
          root: 'bg-teal-6/20',
          icon: 'text-teal-5',
          label: 'text-teal-8 dark:text-teal-2',
          corner: 'border-teal-5',
        },
      },
      size: {
        // Padding tối thiểu + số TO hơn nhãn ≥ 2 bậc — "nhìn phát biết luôn"
        // (yêu cầu lãnh đạo): nhãn lùi về caption, value là thứ đập vào mắt.
        sm: {
          root: 'h-7 gap-1.5 px-1.5',
          label: 'text-caption-10 uppercase tracking-wider',
          value: 'text-body-16-semibold',
          hint: 'text-caption-10',
        },
        md: {
          root: 'h-8 gap-2 px-2',
          label: 'text-caption-12-medium',
          value: 'text-body-18-semibold',
          hint: 'text-caption-10',
        },
      },
    },
    defaultVariants: { color: 'sky', size: 'md' },
  },
  { twMergeConfig: twMergeFontExtend },
);

// ── Types ──────────────────────────────────────────────────────────────────────

export type SummaryPillColor = NonNullable<VariantProps<typeof summaryPillStyles>['color']>;
export type SummaryPillSize = NonNullable<VariantProps<typeof summaryPillStyles>['size']>;

const ICON_SIZE: Record<SummaryPillSize, number> = { sm: 14, md: 16 };

/** Map tone → token màu thật (Figma dùng tên legacy cho vài tone). */
const TONE_TOKEN: Record<SummaryPillColor, string> = {
  sky: 'primary',
  green: 'success',
  yellow: 'accent',
  orange: 'orange',
  indigo: 'indigo',
  pink: 'pink',
  fuchsia: 'fuchsia',
  purple: 'purple',
  blue: 'blue',
  red: 'error',
  teal: 'teal',
};

/** Vát góc TL/BR 6px + viền trong + quầng sáng theo tone. */
const NOTCH_CLIP =
  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';

export interface SummaryPillProps {
  /** Bold-only icon (BẮT BUỘC `-bold` variant). */
  icon: BoldSystemIconName;
  /** Nhãn hiển thị bên cạnh icon. */
  label: string;
  /** Giá trị KPI (đã format). */
  value: number | string;
  /**
   * Số ĐẾM LÊN khi pill hiện ra. Mặc định BẬT; máy bật prefers-reduced-motion
   * tự tắt. Chỉ có tác dụng khi `value` là SỐ.
   *
   * ⚠️ Pill hay nằm TRONG THANH HEADER hoặc TitleScreen — nơi có 3–5 cái xếp
   *    cạnh nhau. Đó chính là chỗ số chạy có giá trị nhất (mắt bắt được cái
   *    vừa đổi), nên đừng tắt hàng loạt vì "cho gọn".
   */
  animate?: boolean;
  /** Text phụ đặt sau value — vd "(8 pending)". Optional. */
  hint?: ReactNode;
  /** Skin tone. Default `sky`. */
  color?: SummaryPillColor;
  /** Kích thước. Default `md`. */
  size?: SummaryPillSize;
  className?: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

const SummaryPill = memo(function SummaryPill({
  icon,
  label,
  value,
  animate = true,
  hint,
  color = 'sky',
  size = 'md',
  className,
}: SummaryPillProps) {
  const slots = summaryPillStyles({ color, size });
  const corner = slots.corner();
  const toneVar = `var(--color-${TONE_TOKEN[color]}-5)`;

  return (
    <div
      className={cn(slots.root(), className)}
      style={{
        clipPath: NOTCH_CLIP,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${toneVar} 20%, transparent), 0 0 14px -6px color-mix(in srgb, ${toneVar} 85%, transparent)`,
      }}
    >
      {/* HUD bracket — 2 góc KHÔNG bị vát (TR + BL), tone-5. */}
      <span aria-hidden className={cn(corner, 'right-0 top-0 border-r-[1.5px] border-t-[1.5px]')} />
      <span
        aria-hidden
        className={cn(corner, 'bottom-0 left-0 border-b-[1.5px] border-l-[1.5px]')}
      />

      <SystemIcon className={slots.icon()} name={icon} size={ICON_SIZE[size]} />
      {/* Label pha tone với `fg-1` thay vì cố định tone-2 (tone-2 là pastel ở CẢ
          2 theme → chìm hoàn toàn trên nền sáng). Mix giữ được color-coding mà
          vẫn tương phản đúng theo theme. */}
      <span
        className={slots.label()}
        style={{ color: `color-mix(in srgb, ${toneVar} 55%, var(--color-fg-1))` }}
      >
        {label}
      </span>
      <span className="flex items-baseline gap-1">
        <span
          className={slots.value()}
          style={{ textShadow: `0 0 12px color-mix(in srgb, ${toneVar} 55%, transparent)` }}
        >
          {typeof value === 'number' ? <AnimatedNumber disabled={!animate} value={value} /> : value}
        </span>
        {hint != null && hint !== '' && <span className={slots.hint()}>{hint}</span>}
      </span>
    </div>
  );
});

export default SummaryPill;
