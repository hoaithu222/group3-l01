import { memo, useCallback } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';

import { cn, twMergeFontExtend } from '@/shared/utils/style/cn';
import type { SystemIconName } from '@/shared/ui/icons';
import { SystemIcon } from '@/shared/ui/icons/Icons';

/**
 * Callout — semantic feedback block (a.k.a. Alert).
 *
 * Matrix: 5 intents × 2 variants
 *   - intent:  info | success | warning | error | neutral
 *   - variant: tinted (default — soft bg + thin border) | ghost (no bg, no border)
 *
 * Default icon auto-mapped per intent (override via `icon`, `icon={false}` to hide).
 * Composition:  [icon] [title? + description/children] [close?]
 */

type BoldIconName = Extract<SystemIconName, `${string}-bold`>;

const callout = tv(
  {
    slots: {
      base: 'flex items-start gap-3 border px-3 py-2.5',
      iconWrap: 'flex h-5 shrink-0 items-center justify-center',
      body: 'flex min-w-0 flex-1 flex-col gap-0.5',
      title: 'text-body-14-medium',
      description: 'text-body-14 opacity-90',
      close: [
        '-mr-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center',
        'text-current opacity-70 transition-opacity',
        'hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-current/40',
      ],
    },
    variants: {
      /*
       * Màu theo intent khai HAI bậc: theme sáng `-7`/`-8`, theme tối `-5` (`dark:`). Thang màu tông
       * KHÔNG lật theo theme — bậc `-5` chỉ đọc được trên nền navy; trên nền tint sáng, chữ vàng
       * `yellow-5` / lục `green-5` gần như biến mất (≈1.3:1). Xem `text-contrast.md §1`.
       */
      intent: {
        info: { iconWrap: 'text-blue-7 dark:text-blue-5' },
        success: { iconWrap: 'text-green-7 dark:text-green-5' },
        warning: { iconWrap: 'text-yellow-7 dark:text-yellow-5' },
        error: { iconWrap: 'text-red-7 dark:text-red-5' },
        neutral: { iconWrap: 'text-fg-4' },
      },
      variant: {
        tinted: {},
        ghost: {
          base: 'border-transparent bg-transparent px-0 py-1',
        },
      },
    },
    compoundVariants: [
      // tinted — bg + border + text per intent (auto theme-aware via color vars)
      {
        intent: 'info',
        variant: 'tinted',
        class: { base: 'bg-blue-6/15 border-blue-5/30 text-blue-7 dark:text-blue-5' },
      },
      {
        intent: 'success',
        variant: 'tinted',
        class: { base: 'bg-green-6/15 border-green-5/30 text-green-8 dark:text-green-5' },
      },
      {
        intent: 'warning',
        variant: 'tinted',
        class: { base: 'bg-yellow-6/15 border-yellow-5/30 text-yellow-8 dark:text-yellow-5' },
      },
      {
        intent: 'error',
        variant: 'tinted',
        class: { base: 'bg-red-6/15 border-red-5/30 text-red-7 dark:text-red-5' },
      },
      {
        intent: 'neutral',
        variant: 'tinted',
        class: { base: 'bg-bg-2 border-border-1 text-fg-1' },
      },
      // ghost — semantic text only (no bg/border)
      { intent: 'info', variant: 'ghost', class: { base: 'text-blue-7 dark:text-blue-5' } },
      { intent: 'success', variant: 'ghost', class: { base: 'text-green-8 dark:text-green-5' } },
      { intent: 'warning', variant: 'ghost', class: { base: 'text-yellow-8 dark:text-yellow-5' } },
      { intent: 'error', variant: 'ghost', class: { base: 'text-red-7 dark:text-red-5' } },
      { intent: 'neutral', variant: 'ghost', class: { base: 'text-fg-1' } },
    ],
    defaultVariants: { intent: 'info', variant: 'tinted' },
  },
  { twMergeConfig: twMergeFontExtend },
);

type CalloutVariants = VariantProps<typeof callout>;
export type CalloutIntent = NonNullable<CalloutVariants['intent']>;
export type CalloutVariant = NonNullable<CalloutVariants['variant']>;

const DEFAULT_ICON: Record<CalloutIntent, BoldIconName> = {
  info: 'circle-exclamation-bold',
  success: 'circle-check-bold',
  warning: 'triangle-exclamation-bold',
  error: 'circle-xmark-bold',
  neutral: 'bell-bold',
};

export interface CalloutProps {
  intent?: CalloutIntent;
  variant?: CalloutVariant;
  /** Tiêu đề ngắn (in đậm) */
  title?: React.ReactNode;
  /** Nội dung giải thích chi tiết */
  description?: React.ReactNode;
  /** Fallback cho description khi không truyền `description` */
  children?: React.ReactNode;
  /**
   * Ghi đè icon:
   *   - `BoldIconName` (vd "circle-check-bold") — preset icon từ registry
   *   - `ReactNode` — node tùy biến
   *   - `false` — ẩn icon
   */
  icon?: BoldIconName | React.ReactNode | false;
  /**
   * Hành động đi kèm nội dung (vd nút "Thử lại" của banner lỗi tải dữ liệu). Nằm cùng hàng với nội
   * dung, sát phải; màn hẹp thì tự xuống dòng — thay cho `<div className="flex flex-wrap …">` mà từng
   * màn tự bọc quanh `description` (đã lặp ở hơn chục chỗ).
   */
  action?: React.ReactNode;
  /** Hiện nút × đóng nhanh ở biên phải */
  closable?: boolean;
  onClose?: () => void;
  className?: string;
}

const isIconName = (v: unknown): v is BoldIconName => typeof v === 'string';

function Callout({
  intent = 'info',
  variant = 'tinted',
  title,
  description,
  children,
  icon,
  action,
  closable = false,
  onClose,
  className,
}: CalloutProps) {
  const slots = callout({ intent, variant });
  const showIcon = icon !== false;
  const content = description ?? children;

  const handleClose = useCallback(() => onClose?.(), [onClose]);

  const renderIcon = () => {
    if (icon === undefined) return <SystemIcon name={DEFAULT_ICON[intent]} size={16} />;
    if (isIconName(icon)) return <SystemIcon name={icon} size={16} />;
    return icon;
  };

  return (
    <div className={cn(slots.base(), className)} role={intent === 'error' ? 'alert' : 'status'}>
      {showIcon && <span className={slots.iconWrap()}>{renderIcon()}</span>}
      <div className={slots.body()}>
        {title != null && <div className={slots.title()}>{title}</div>}
        {(content != null || action != null) && (
          <div
            className={cn(
              slots.description(),
              action != null && 'flex flex-wrap items-center justify-between gap-2',
            )}
          >
            {content != null && (action != null ? <span>{content}</span> : content)}
            {action}
          </div>
        )}
      </div>
      {closable && (
        <button aria-label="Đóng" className={slots.close()} type="button" onClick={handleClose}>
          <SystemIcon name="xmark-bold" size={14} />
        </button>
      )}
    </div>
  );
}

export default memo(Callout);
