import * as PopoverPrimitive from '@radix-ui/react-popover';
import { tv, type VariantProps } from 'tailwind-variants';
import { twMergeFontExtend } from '@/shared/utils/style/cn';
import { popupSurface } from './popup-surface.theme';

/**
 * Popover — floating panel trên Radix Popover primitives.
 *
 * Surface: DataV-premium — kết hợp fintech (dense, sharp) + Chinese dashboard
 * (cyan/teal glow border + inset light leak). Thiết kế nổi bật hơn card thường:
 *  - Bg: `bg-bg-popup` (theme-aware, semi-transparent dark) + `backdrop-blur-md`
 *    (12px glass effect) → nổi trên content behind mà không harsh.
 *  - Border: `border-teal-5/30` (1px teal glow) → định nghĩa cạnh rõ trong dark,
 *    signal "hi-tech command center" theo DataV convention.
 *  - Shadow: dual-layer — outer cyan glow + deep drop shadow → premium depth.
 *  - Enter animation: fade + scale-in 95% (Radix data-state=open). Fast 180ms.
 *
 * Variants `glass` / `solid` — hiện GIỐNG NHAU (API compat 51 call-site).
 *
 * Usage:
 *   <Popover content={<ModulesPopover />}>
 *     <Button>Modules</Button>
 *   </Popover>
 *
 * Trigger: single focusable element via Radix `asChild`.
 * Content: unpadded — padding trong content hoặc qua `className`.
 */
const styles = tv(
  {
    slots: {
      // Bề mặt lấy từ `popup-surface.theme`; Popover cố ý dùng viền dày hơn
      // Menu/ContextMenu vì nó thường mang cả một panel nội dung, không phải danh
      // sách dòng.
      content: [
        popupSurface({ borderWidth: 'thick' }),
        'outline-none text-body-14 text-fg-on-popup',
      ],
      arrow: 'fill-bg-popup',
    },
    variants: {
      variant: {
        glass: {},
        solid: {
          content: [
            'border-2 border-teal-5/50 bg-bg-popup',
            'shadow-[0_0_24px_color-mix(in_srgb,var(--color-teal-5)_20%,transparent),0_10px_30px_var(--color-popup-shadow),inset_0_0_20px_color-mix(in_srgb,var(--color-teal-5)_5%,transparent)]',
            // solid = opaque, no blur
            '[--tw-backdrop-blur:initial] backdrop-filter-none',
          ],
        },
      },
    },
    defaultVariants: { variant: 'glass' },
  },
  { twMergeConfig: twMergeFontExtend },
);

export type PopoverVariant = NonNullable<VariantProps<typeof styles>['variant']>;

export interface PopoverProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Prevent trigger from opening the popover. Default false. Vô hiệu khi `anchorOnly`. */
  disabled?: boolean;
  /**
   * `true` → `children` chỉ là ANCHOR để định vị, KHÔNG phải trigger toggle.
   *
   * Vì sao cần: `Popover.Trigger` của Radix gắn `onOpenToggle` vào `onClick`. Với
   * combobox / typeahead (input + list gợi ý), caller đã tự mở popover theo focus
   * hoặc keystroke rồi, nên cú click vào input sẽ TOGGLE ngược lại: popover vừa
   * hiện xong tắt ngay ⇒ hiện tượng "nháy". Bật `anchorOnly` thì `open` do caller
   * sở hữu 100%, Radix không tự đổi state nữa.
   *
   * Lưu ý khi bật: anchor nằm NGOÀI content nên `DismissableLayer` coi click/focus
   * vào chính nó là "interact outside" và sẽ đóng. Chặn bằng `onInteractOutside`
   * + `e.preventDefault()` khi target nằm trong anchor.
   */
  anchorOnly?: boolean;
  /** Called when content opens — pass `(e) => e.preventDefault()` to block focus steal. */
  onOpenAutoFocus?: (e: Event) => void;
  /**
   * Called when focus returns to the trigger on close. `e.preventDefault()` +
   * `trigger.focus({ preventScroll: true })` để tránh trình duyệt CUỘN vùng
   * chứa trigger vào tầm nhìn — hay gặp khi trigger nằm cuối một panel có
   * `overflow-y-auto`.
   */
  onCloseAutoFocus?: (e: Event) => void;
  /**
   * Called when an interaction (pointer/focus) happens outside content.
   * `e.preventDefault()` giữ popover mở — vd: khi click vào Radix Select portal
   * lồng bên trong để không bị đóng popover.
   */
  onInteractOutside?: (e: Event) => void;
  /** Show pointing arrow. Default false. */
  arrow?: boolean;
  /** Modal mode — blocks outside interactions while open. Default false. */
  modal?: boolean;
  /**
   * Portal container. Mặc định `document.body`. Truyền node DialogContent khi
   * Popover nằm trong Modal (Radix Dialog) để wheel-scroll không bị RemoveScroll
   * (scroll-lock của Dialog) chặn — vì content portal ra body sẽ nằm ngoài vùng lock.
   */
  container?: HTMLElement | null;
  /**
   * Vùng được coi là "màn hình" khi Radix tránh va chạm. Mặc định là viewport.
   *
   * Truyền khi popover sống trong một khung con có biên riêng — ví dụ panel nổi trên pane
   * 3D: viewport còn trống cả vùng gantt bên dưới nên Radix tưởng thừa chỗ, danh sách xổ
   * xuống rồi tràn khỏi pane. Có biên đúng thì nó tự lật lên trên và
   * `--radix-popover-content-available-height` cũng đo theo biên đó.
   */
  collisionBoundary?: Element | null | Array<Element | null>;
  /** Khoảng chừa tối thiểu tới mép biên va chạm (px). Mặc định 0. */
  collisionPadding?: number;
  /** Surface preset — see component docs. Default `glass`. */
  variant?: PopoverVariant;
  /** Content panel className override. */
  className?: string;
}

function Popover({
  content,
  children,
  side = 'bottom',
  align = 'center',
  sideOffset = 4,
  open,
  defaultOpen,
  onOpenChange,
  disabled = false,
  anchorOnly = false,
  onOpenAutoFocus,
  onCloseAutoFocus,
  onInteractOutside,
  arrow = false,
  modal = false,
  container,
  collisionBoundary,
  collisionPadding,
  variant = 'glass',
  className,
}: PopoverProps) {
  const slots = styles({ variant });

  return (
    <PopoverPrimitive.Root
      defaultOpen={defaultOpen}
      modal={modal}
      open={open}
      onOpenChange={onOpenChange}
    >
      {anchorOnly ? (
        <PopoverPrimitive.Anchor asChild>{children}</PopoverPrimitive.Anchor>
      ) : (
        <PopoverPrimitive.Trigger asChild disabled={disabled}>
          {children}
        </PopoverPrimitive.Trigger>
      )}
      <PopoverPrimitive.Portal container={container ?? undefined}>
        <PopoverPrimitive.Content
          align={align}
          className={slots.content({ class: className })}
          // `null` phải thành `undefined`: Radix coi `null` là một biên hợp lệ (rỗng), còn
          // `undefined` mới là "dùng viewport". Ref chưa gắn xong hay trả `null`.
          collisionBoundary={collisionBoundary ?? undefined}
          collisionPadding={collisionPadding}
          side={side}
          sideOffset={sideOffset}
          onCloseAutoFocus={onCloseAutoFocus}
          onInteractOutside={onInteractOutside}
          onOpenAutoFocus={onOpenAutoFocus}
        >
          {content}
          {arrow && <PopoverPrimitive.Arrow className={slots.arrow()} />}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export default Popover;
