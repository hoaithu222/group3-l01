/**
 * Toolbar — hàng công cụ / bộ lọc của trang: cụm trái nở, cụm phải ghim.
 *
 * ── Vì sao cụm trái NỞ và cụm phải GHIM ────────────────────────────────────
 * Cụm trái là BỘ LỌC (ô tìm, dropdown trạng thái, khoảng ngày) — chúng chịu co
 * và chịu xuống dòng. Cụm phải là HÀNH ĐỘNG ("Thêm", "Xuất Excel") — nhãn của
 * chúng ngắn và cố định, co lại là chữ bị cắt thành "Xuất Ex…". Nên phần thiếu
 * chỗ luôn trừ vào cụm trái.
 *
 * ⛔ `min-w-0` trên cụm trái là BẮT BUỘC. Ô tìm bên trong thường có `w-full`
 *    hoặc `truncate`; thiếu sàn-0 thì cụm trái không hẹp xuống dưới bề rộng nội
 *    dung, phần dôi tràn ra và ĐÈ LÊN cụm hành động bên phải.
 *
 * ── Vì sao có `border` / `padding` variant ─────────────────────────────────
 * Trên hệ PMS gốc, hàng công cụ được gõ tay với 4 biến thể khác nhau:
 *   `border-b border-border-1 p-2` · `… px-3 py-2` · `border-t … px-2 py-2`
 *   · không viền không đệm
 * Bốn kiểu đệm cho cùng một loại hàng nghĩa là các hàng nằm trên/dưới nhau
 * không cùng nhịp. Ở đây chúng thành variant, nên chỉ còn một thang.
 *
 * ⚠️ Toolbar KHÔNG tự cuộn ngang. Nếu cụm hành động dài hơn màn (máy tính bảng
 *    dọc), bọc chính cụm đó trong vùng `overflow-x-auto overscroll-x-contain` —
 *    xem cách `BoxPanel` xử lý `headerRight`. "Cuộn, không ẩn"
 *    (`docs/rules/ipad-responsive.md §4`).
 */
import { memo } from 'react';
import type { ReactNode } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';

import { cn } from '@/shared/utils/style/cn';

const toolbar = tv({
  slots: {
    root: 'flex shrink-0 flex-wrap items-center justify-between gap-2',
    /** Cụm lọc — nở, chịu xuống dòng, có sàn-0 để co được. */
    left: 'flex min-w-0 flex-1 flex-wrap items-center gap-2',
    /** Cụm hành động — ghim, KHÔNG xuống dòng, KHÔNG co. */
    right: 'flex shrink-0 items-center gap-2',
  },
  variants: {
    border: {
      none: {},
      bottom: { root: 'border-b border-border-1' },
      top: { root: 'border-t border-border-1' },
    },
    padding: {
      none: {},
      sm: { root: 'px-2 py-1.5' },
      md: { root: 'p-2' },
      lg: { root: 'px-3 py-2.5' },
    },
  },
  defaultVariants: { border: 'none', padding: 'none' },
});

export type ToolbarBorder = NonNullable<VariantProps<typeof toolbar>['border']>;
export type ToolbarPadding = NonNullable<VariantProps<typeof toolbar>['padding']>;

export interface ToolbarProps {
  /** Cụm bộ lọc bên trái. */
  left?: ReactNode;
  /** Cụm hành động bên phải. */
  right?: ReactNode;
  border?: ToolbarBorder;
  padding?: ToolbarPadding;
  className?: string;
}

const Toolbar = memo(function Toolbar({ left, right, border, padding, className }: ToolbarProps) {
  const slots = toolbar({ border, padding });

  return (
    <div className={cn(slots.root(), className)}>
      {/*
        Ô trái LUÔN render, kể cả rỗng: thiếu nó thì `justify-between` không có
        gì để đẩy và cụm hành động trôi về mép TRÁI.
      */}
      <div className={slots.left()}>{left}</div>
      {/* Ô phải `:empty` thì không dựng — không để lại khe `gap` vô nghĩa. */}
      {right != null && right !== false && <div className={slots.right()}>{right}</div>}
    </div>
  );
});

export default Toolbar;
