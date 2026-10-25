/**
 * Logo — brand lockup của header: emblem (tuỳ chọn) + wordmark.
 *
 * Ba chế độ:
 *  - Có `href` → `<Link>`: chuột phải mở được tab mới (`navigable-controls.md`).
 *  - Chỉ có `onClick` → `<button>` (lệnh tại chỗ, không đổi URL).
 *  - Không có gì → `<span>` tĩnh (showcase).
 *
 * Generic: KHÔNG gắn với registry ảnh nào. App truyền emblem qua slot `mark`
 * (thường là `<Image name="..." />` hoặc `<SystemIcon name="..." />`).
 */
import { memo, useCallback } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/shared/utils/style/cn';
import { isModifiedClick } from '@/shared/utils/browser/link.utils';

import { logoStyles } from '../header.theme';

interface LogoProps {
  /** Wordmark. Ẩn dưới `md` để nhường chỗ cho chip của page. */
  label?: string;
  /** Emblem đứng trước wordmark — `<Image>` / `<SystemIcon>` do app truyền. */
  mark?: ReactNode;
  /** URL đích THẬT. */
  href?: string;
  onClick?: () => void;
  /** Nhãn trợ năng — mặc định theo `label`. */
  ariaLabel?: string;
  className?: string;
}

const { root, mark: markSlot, text } = logoStyles();

const Logo = memo(function Logo({
  label = 'APP',
  mark,
  href,
  onClick,
  ariaLabel,
  className,
}: LogoProps) {
  const handleClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      // Không có side-effect kèm theo → để `<Link>` tự điều hướng.
      if (!onClick) return;
      // Mở tab/cửa sổ mới → nhường trình duyệt, KHÔNG chạy side-effect của tab này.
      if (isModifiedClick(e)) return;
      e.preventDefault();
      onClick();
    },
    [onClick],
  );

  const inner = (
    <>
      {mark && <span className={markSlot()}>{mark}</span>}
      <span className={text()}>{label}</span>
    </>
  );

  const a11yLabel = ariaLabel ?? label;

  if (href) {
    return (
      <Link
        aria-label={a11yLabel}
        className={cn(root({ interactive: true }), className)}
        to={href}
        onClick={handleClick}
      >
        {inner}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        aria-label={a11yLabel}
        className={cn(root({ interactive: true }), className)}
        type="button"
        onClick={onClick}
      >
        {inner}
      </button>
    );
  }

  return <span className={cn(root(), className)}>{inner}</span>;
});

export default Logo;
