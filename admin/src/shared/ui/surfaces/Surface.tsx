/**
 * Surface — MẶT NỀN TRẦN: một khung `viền + nền` không có tiêu đề.
 *
 * Vì sao cần một component cho ngần ấy class:
 * Trước đây bộ ba `border border-border-1 bg-bg-1` được gõ tay 21 lần rải khắp
 * `features/`, mỗi chỗ tự nối thêm một kiểu đệm (`p-2`, `p-3`, `px-3 py-2`,
 * `px-2 py-1.5`, hoặc không đệm). Hai hệ quả đã thấy:
 *   • đổi nét viền hay nền của "hộp phẳng" phải sửa 21 chỗ, và chỉ cần sót một
 *     chỗ là màn hình có hai sắc nền cạnh nhau;
 *   • ĐỆM KHÔNG THEO THANG NÀO — bốn giá trị khác nhau cho cùng một loại hộp,
 *     nên các hộp nằm cạnh nhau không cùng nhịp.
 * Gom vào đây thì nét và nền có MỘT nguồn, còn đệm bị ép về đúng thang `padding`
 * bên dưới.
 *
 * ── Chọn cái nào ────────────────────────────────────────────────────────────
 *   `Surface`   hộp phẳng, KHÔNG tiêu đề — bọc một mẫu, một ô xem trước, một
 *               vùng thả tệp… Đây là mức thấp nhất.
 *   `BoxPanel`  có hàng tiêu đề + slot phải + footer, thân tự cuộn.
 *   `HudFrame`  khung trang trí kiểu HUD (ngoặc góc, vệt chéo).
 * Cần tiêu đề thì ĐỪNG dựng tay bằng `Surface` — dùng `BoxPanel`.
 *
 * ⚠️ `interactive` chỉ đổi PHẢN HỒI HÌNH (viền sáng lên, con trỏ tay). Nó KHÔNG
 *    biến `<div>` thành nút: hộp bấm được vẫn phải là `<button>`/`<a>` thật thì
 *    bàn phím và trình đọc màn hình mới với tới — truyền `as="button"`.
 */
import { memo } from 'react';
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';

import { cn } from '@/shared/utils/style/cn';

// ── Recipe ────────────────────────────────────────────────────────────────────

const surface = tv({
  base: 'border border-border-1 bg-bg-1',
  variants: {
    /**
     * Thang đệm — CỐ Ý chỉ có 4 bậc. Bốn giá trị rời rạc trước đây (8 · 12 ·
     * `px-3 py-2` · `px-2 py-1.5`) nay quy về `sm`/`md`; ai cần con số ngoài
     * thang thì truyền `className`, và việc phải viết ra như thế là tín hiệu
     * để soát lại xem có thật sự cần không.
     */
    padding: {
      none: '',
      sm: 'p-2',
      md: 'p-3',
      lg: 'p-4',
    },
    /** Nền `bg-2` — dùng khi hộp nằm TRÊN một `bg-1` khác, cần tách lớp. */
    tone: {
      base: 'bg-bg-1',
      sunken: 'bg-bg-2',
    },
    /** Viền sáng lên khi rê chuột — cho ô chọn được trong lưới. */
    interactive: {
      true: 'cursor-pointer transition-colors duration-150 hover:border-primary-5',
    },
    /** Bo góc. Mặc định VUÔNG cho khớp ngôn ngữ hình của bộ kit. */
    rounded: {
      true: 'rounded',
    },
  },
  defaultVariants: { padding: 'none', tone: 'base' },
});

export type SurfacePadding = NonNullable<VariantProps<typeof surface>['padding']>;
export type SurfaceTone = NonNullable<VariantProps<typeof surface>['tone']>;

// ── Props ─────────────────────────────────────────────────────────────────────

export interface SurfaceProps extends VariantProps<typeof surface> {
  /**
   * Thẻ HTML dựng ra. Mặc định `div`.
   * Hộp BẤM ĐƯỢC phải truyền `as="button"` — xem ghi chú đầu file.
   */
  as?: ElementType;
  children?: ReactNode;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

const Surface = memo(function Surface({
  as,
  padding,
  tone,
  interactive,
  rounded,
  children,
  className,
  ...rest
}: SurfaceProps & Omit<ComponentPropsWithoutRef<'div'>, keyof SurfaceProps>) {
  const Tag = (as ?? 'div') as ElementType;

  return (
    <Tag className={cn(surface({ padding, tone, interactive, rounded }), className)} {...rest}>
      {children}
    </Tag>
  );
});

export default Surface;
