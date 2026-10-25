import { forwardRef, useMemo } from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { tv } from 'tailwind-variants';
import { twMergeFontExtend } from '@/shared/utils/style/cn';
import {
  POPUP_ITEM_CLASS,
  POPUP_ITEM_ICON_CLASS,
  popupSurface,
} from '@/shared/ui/overlays/popup-surface.theme';

/**
 * Menu — action dropdown powered by Radix DropdownMenu.
 *
 * Each item triggers `onSelect`; no selection state. Use this for context-menu
 * style action lists (Edit / Delete / Share, etc.). For selection use `Dropdown`
 * (single) or `MultiSelect` (multi).
 */
export interface MenuOption {
  /** Stable identifier passed back via `onSelect`. */
  key: string;
  label: string | React.ReactNode;
  /** Leading icon node (e.g. lucide). */
  icon?: React.ReactNode;
  disabled?: boolean;
  /** Tooltip text (native title) hiển thị khi item disabled — vd lý do thiếu quyền. */
  hint?: string;
  /** Tông nguy hiểm — icon + nhãn đỏ (vd "Xóa"). */
  danger?: boolean;
}

const styles = tv(
  {
    slots: {
      // Bề mặt + dòng menu lấy từ `overlays/popup-surface.theme` — Menu,
      // ContextMenu và Popover dùng CHUNG một nguồn thay vì tự đồng bộ tay.
      content: [popupSurface(), 'min-w-[220px]'],
      item: POPUP_ITEM_CLASS,
      icon: POPUP_ITEM_ICON_CLASS,
    },
    variants: {
      tone: {
        default: {},
        danger: { item: 'text-error', icon: 'text-error' },
      },
    },
    defaultVariants: { tone: 'default' },
  },
  { twMergeConfig: twMergeFontExtend },
);

export interface MenuProps {
  /** Element rendered as trigger; clicking opens the menu. */
  trigger: React.ReactNode;
  options: MenuOption[];
  onSelect?: (option: MenuOption) => void;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /** Content panel className override. */
  contentClassName?: string;
  /**
   * Static header slot rendered above options (e.g. user info card).
   * Non-interactive — clicking header does not fire onSelect.
   * Divider mảnh dưới header render tự động khi có header.
   */
  header?: React.ReactNode;
  /**
   * Radix modal mode (default true). Đặt `false` khi 1 item mở tiếp 1 Dialog:
   * modal menu khoá `pointer-events` trên body → sau khi đóng Dialog bằng click
   * ngoài, body kẹt `pointer-events: none`. `modal={false}` để hết kẹt.
   */
  modal?: boolean;
  /**
   * Radix `onCloseAutoFocus` của Content. Truyền `(e) => e.preventDefault()` khi
   * item mở 1 input focus riêng (vd đổi tên inline) → chặn menu trả focus về
   * trigger, để input `autoFocus` giữ được focus.
   */
  onCloseAutoFocus?: (event: Event) => void;
  /**
   * Điều khiển đóng/mở từ ngoài. Bỏ trống → menu tự quản (như cũ).
   *
   * Cần khi `header` chứa nút bấm được (Radix chỉ tự đóng khi chọn một `Item`,
   * không đóng khi bấm vào header) — vd hàng emoji thả cảm xúc: bấm xong phải
   * đóng menu, nếu không nó treo lại giữa màn hình.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const Menu = forwardRef<HTMLDivElement, MenuProps>(
  (
    {
      trigger,
      options,
      onSelect,
      side = 'bottom',
      align = 'start',
      contentClassName,
      header,
      modal,
      onCloseAutoFocus,
      open,
      onOpenChange,
    },
    ref,
  ) => {
    const slots = styles();

    // Extract map ra biến — React Compiler tự memoize JSX rendering.
    // Tone tính THEO TỪNG option (danger → icon + label đỏ).
    const optionElements = useMemo(
      () =>
        options.map((option) => {
          const s = styles({ tone: option.danger ? 'danger' : 'default' });
          return (
            <DropdownMenuPrimitive.Item
              key={option.key}
              className={s.item()}
              disabled={option.disabled}
              // Native title (không bọc Tooltip — tránh phá focus/keyboard của Radix menu).
              title={option.disabled ? option.hint : undefined}
              onSelect={() => onSelect?.(option)}
            >
              {option.icon && <span className={s.icon()}>{option.icon}</span>}
              <span className="flex-1">{option.label}</span>
            </DropdownMenuPrimitive.Item>
          );
        }),
      [onSelect, options],
    );

    return (
      <DropdownMenuPrimitive.Root modal={modal} open={open} onOpenChange={onOpenChange}>
        <DropdownMenuPrimitive.Trigger asChild>{trigger}</DropdownMenuPrimitive.Trigger>
        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content
            ref={ref}
            align={align}
            className={slots.content({ class: contentClassName })}
            side={side}
            sideOffset={4}
            // Menu hay được render BÊN TRONG một row bấm được (vd row của
            // react-arborist trong kit2 Tree). Portal của React vẫn bubble event
            // theo CÂY REACT → chọn 1 mục menu sẽ kích hoạt luôn onClick của row
            // (toggle/select nhầm). Chặn tại biên: handler BÊN TRONG menu đã chạy
            // xong, chỉ cắt đường lên ancestor. (Cùng ý đồ với `Modal`.)
            // ⛔ CHỈ `click` — KHÔNG chặn `pointerdown`: Radix đóng lớp nổi đang
            // mở bằng listener `pointerdown` ở `document`; chặn sẽ làm menu/popover
            // khác không đóng được và chồng lên nhau.
            onClick={(e) => e.stopPropagation()}
            onCloseAutoFocus={onCloseAutoFocus}
          >
            {header && (
              <>
                <DropdownMenuPrimitive.Label className="px-3 py-2.5">
                  {header}
                </DropdownMenuPrimitive.Label>
                <DropdownMenuPrimitive.Separator className="h-px bg-border-1" />
              </>
            )}
            {optionElements}
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenuPrimitive.Root>
    );
  },
);

Menu.displayName = 'Menu';

export default Menu;
