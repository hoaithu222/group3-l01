import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { tv, type VariantProps } from 'tailwind-variants';

import { twMergeFontExtend } from '@/shared/utils/style/cn';

/**
 * Tooltip — kit2 tooltip on top of Radix Tooltip primitives.
 *
 * Hai bề mặt, chọn theo THỨ ĐANG NÓI chứ không theo sở thích:
 *
 * | variant | Dùng cho | Bề mặt |
 * |---------|----------|--------|
 * | `hint` (mặc định) | Gợi ý một câu cho control: tên nút icon, phím tắt | `black-6` + blur 5px, chữ căn GIỮA (Figma 469:1738) |
 * | `data` | Hộp SỐ LIỆU: dòng bảng, cột biểu đồ, thẻ KPI | `bg-popup` + viền `border-2`, chữ căn TRÁI |
 *
 * `data` cố ý dựng đúng bề mặt mà tooltip biểu đồ đang dùng
 * (`buildChartStyles().tooltip` của `@/shared/charts`: nền `bg-popup`, viền 1px
 * `border-2`, vuông góc, đổ bóng `popup-shadow`) — để rê chuột lên một dòng danh
 * sách và rê lên một cột biểu đồ ra CÙNG một hộp, thay vì mỗi nơi một kiểu.
 * Sửa bề mặt ở đây thì sửa cả hai chỗ cho khớp.
 *
 * `data` cũng TẮT `backdrop-filter`: nó ép panel thành composited layer riêng,
 * mà hộp số liệu bám con trỏ nên toạ độ luôn lẻ → chữ bị nội suy, mờ đúng lúc
 * người dùng đang cố đọc số. (Cùng lý do đã ghi ở `chart-style.utils.ts`.)
 *
 * Usage:
 *   <Tooltip content="Hint">
 *     <Button>Hover me</Button>
 *   </Tooltip>
 *
 *   <Tooltip content={<VolumeTooltip group={group} />} variant="data">
 *     <div>…dòng dữ liệu…</div>
 *   </Tooltip>
 *
 * Trigger must be a single focusable element (rendered via Radix `asChild`).
 */
const styles = tv(
  {
    slots: {
      content: ['z-[999] max-w-xs px-3 py-2', 'text-caption-12-medium'],
      arrow: '',
    },
    variants: {
      variant: {
        hint: {
          content: 'text-center text-white-10 bg-black-6 backdrop-blur-[5px]',
          // Nền bán trong suốt → KHÔNG kéo arrow chồng lên panel (2 lớp alpha
          // chồng nhau sẽ tạo vệt đậm hơn ở chân mũi tên).
          arrow: 'fill-black-6',
        },
        data: {
          content: [
            'px-2.5 py-2 text-left text-fg-1',
            'border border-border-2 bg-bg-popup',
            'shadow-[0_8px_24px_var(--color-popup-shadow)]',
            '[--tw-backdrop-blur:initial] backdrop-filter-none',
          ],
          arrow: 'fill-bg-popup',
        },
      },
    },
    defaultVariants: { variant: 'hint' },
  },
  {
    /*
     * BẮT BUỘC. tailwind-merge mặc định xếp mọi `text-*` lạ vào nhóm text-COLOR,
     * nên `text-caption-12-medium` đứng cạnh `text-white-10` bị coi là trùng
     * nhóm và BỊ LOẠI — tooltip mất luôn cỡ chữ 12px mà chính docblock trên khai,
     * rơi về cỡ chữ thừa kế. Đây là cái bẫy đã ghi ở `tailwind-conventions.md`.
     */
    twMergeConfig: twMergeFontExtend,
  },
);

export type TooltipVariant = NonNullable<VariantProps<typeof styles>['variant']>;

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  /** Hover open delay in ms. Default 200. */
  delayDuration?: number;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Skip rendering the tooltip; passes children through. */
  disabled?: boolean;
  /** Show pointing arrow. Default true. */
  arrow?: boolean;
  /** Surface preset — `hint` (gợi ý 1 câu) hoặc `data` (hộp số liệu). Default `hint`. */
  variant?: TooltipVariant;
  /** Content panel className override. */
  className?: string;
}

function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  sideOffset = 4,
  delayDuration = 200,
  open,
  defaultOpen,
  onOpenChange,
  disabled,
  arrow = true,
  variant = 'hint',
  className,
}: TooltipProps) {
  if (disabled) return <>{children}</>;

  const slots = styles({ variant });

  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root defaultOpen={defaultOpen} open={open} onOpenChange={onOpenChange}>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            align={align}
            className={slots.content({ class: className })}
            side={side}
            sideOffset={sideOffset}
          >
            {content}
            {arrow && <TooltipPrimitive.Arrow className={slots.arrow()} height={6} width={14} />}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export default Tooltip;
