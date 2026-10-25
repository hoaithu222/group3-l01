/**
 * ChipElement — NƠI DUY NHẤT quyết định một chip của page render `<a>` hay
 * `<button>`. Thêm loại chip mới thì đi qua đây, đừng dựng lại nhánh
 * `<Link>`/`<button>` ở chỗ khác.
 *
 * Luật (xem `navigable-controls.md`):
 *   ĐIỀU HƯỚNG   →  `<Link to>` có href THẬT   (chuột phải mở tab mới được)
 *   LỆNH TẠI CHỖ →  `<button>`                 (mở modal, bật/tắt, xuất file)
 *
 * ⛔ Handler PHẢI `return` SỚM khi `isModifiedClick(e)` — TRƯỚC `preventDefault`.
 *    Ctrl/⌘+click · Shift+click · chuột giữa phải để trình duyệt tự lo; tab mới
 *    sẽ dựng lại state từ chính URL đó.
 * ⛔ Chip `disabled` KHÔNG được có href: `<a>` không có thuộc tính disabled nên
 *    bàn phím vẫn đi tới được.
 *
 * ⚠️ HAI ĐIỀU KIỆN BẮT BUỘC để dùng được làm trigger `asChild` của Radix
 *    (`PageHeaderChip` bọc chip trong `<Tooltip>` của kit2):
 *     1. `forwardRef` — Slot của Radix cần clone ref xuống phần tử DOM thật.
 *     2. SPREAD `...rest` — Radix bơm `onPointerEnter` / `onFocus` /
 *        `aria-describedby` / `data-state` qua props. Không spread thì tooltip
 *        KHÔNG BAO GIỜ mở.
 *    Prop kích hoạt vì thế đặt tên `onActivate`, KHÔNG phải `onSelect`:
 *    `onSelect` trùng tên một sự kiện DOM thật nên sẽ đụng với `...rest`.
 *    Và `onClick` phải được TÁCH RA rồi gọi TRƯỚC trong handler — đó là chỗ
 *    Radix bơm hành vi đóng tooltip khi bấm.
 */
import { forwardRef, memo } from 'react';
import type { AnchorHTMLAttributes, MouseEvent, ReactNode, Ref } from 'react';
import { Link } from 'react-router-dom';

import { isModifiedClick, NEW_TAB_LINK_PROPS } from '@/shared/utils/browser/link.utils';

export interface ChipElementProps extends Omit<
  AnchorHTMLAttributes<HTMLElement>,
  'href' | 'onSelect' | 'children'
> {
  className: string;
  /** Có → render `<Link>`. Không → `<button>`. */
  href?: string;
  /** Mở tab mới (`target="_blank"` + `rel="noopener noreferrer"`). */
  newTab?: boolean;
  disabled?: boolean;
  ariaCurrent?: boolean;
  ariaPressed?: boolean;
  /** Đánh dấu để slot cha neo chip xuống đáy thanh (`[&>[data-header-chip]]`). */
  anchorBottom?: boolean;
  onActivate?: () => void;
  children: ReactNode;
}

const ChipElement = memo(
  forwardRef<HTMLElement, ChipElementProps>(function ChipElement(
    {
      className,
      href,
      newTab,
      disabled,
      ariaCurrent,
      ariaPressed,
      anchorBottom,
      onActivate,
      onClick,
      children,
      ...rest
    },
    ref,
  ) {
    const shared = {
      'aria-current': ariaCurrent ? ('page' as const) : undefined,
      'aria-pressed': ariaPressed,
      className,
      'data-header-chip': anchorBottom ? true : undefined,
    };

    if (href && !disabled) {
      const handleAnchorClick = (e: MouseEvent<HTMLAnchorElement>) => {
        // Handler do call-site bơm vào chạy TRƯỚC — nó có thể tự
        // `preventDefault()` để chặn hẳn.
        onClick?.(e);
        if (e.defaultPrevented) return;
        // Mở tab/cửa sổ mới → KHÔNG chặn, KHÔNG chạy `onActivate`.
        if (newTab || isModifiedClick(e)) return;
        e.preventDefault();
        onActivate?.();
      };

      return (
        <Link
          {...rest}
          {...shared}
          {...(newTab ? NEW_TAB_LINK_PROPS : null)}
          ref={ref as Ref<HTMLAnchorElement>}
          to={href}
          onClick={handleAnchorClick}
        >
          {children}
        </Link>
      );
    }

    const handleButtonClick = (e: MouseEvent<HTMLButtonElement>) => {
      onClick?.(e);
      if (e.defaultPrevented) return;
      onActivate?.();
    };

    return (
      <button
        {...rest}
        {...shared}
        ref={ref as Ref<HTMLButtonElement>}
        disabled={disabled}
        type="button"
        onClick={handleButtonClick}
      >
        {children}
      </button>
    );
  }),
);

export default ChipElement;
