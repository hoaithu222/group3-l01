import { forwardRef, useMemo } from 'react';
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import { tv } from 'tailwind-variants';
import { twMergeFontExtend } from '@/shared/utils/style/cn';
import type { MenuOption } from './Menu';
import {
  POPUP_ITEM_CLASS,
  POPUP_ITEM_ICON_CLASS,
  popupSurface,
} from '@/shared/ui/overlays/popup-surface.theme';

/**
 * ContextMenu — action list mở bằng CHUỘT PHẢI (right-click) tại vị trí con trỏ,
 * powered by Radix ContextMenu. Chia sẻ contract `MenuOption[]` với `Menu` (bản
 * dropdown mở bằng click trigger) → cùng 1 options build được cho cả 2.
 *
 *   <ContextMenu options={opts} onSelect={(o) => …}>
 *     <div>Vùng nhận chuột phải</div>
 *   </ContextMenu>
 *
 * `children` được bọc trong Trigger `display:contents` → KHÔNG tạo box, không phá
 * layout flex/grid của hàng chứa nó (dùng trực tiếp trong row của Tree).
 */
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

export interface ContextMenuProps {
  /** Vùng nhận chuột phải. Mặc định bọc trong Trigger `display:contents` (giữ
   *  nguyên layout). `asChild` → merge trực tiếp lên child (child phải là 1 element
   *  duy nhất forward được ref/props, vd `<tr>` trong bảng). */
  children: React.ReactNode;
  options: MenuOption[];
  onSelect?: (option: MenuOption) => void;
  /** Content panel className override. */
  contentClassName?: string;
  /** true → KHÔNG mở context menu (trả về menu mặc định của trình duyệt). */
  disabled?: boolean;
  /** Merge Trigger vào child thay vì bọc span `display:contents` (cho `<tr>`, …). */
  asChild?: boolean;
  /**
   * Radix modal mode (default true). Đặt `false` khi 1 item mở tiếp 1 Dialog:
   * modal menu khoá `pointer-events` trên body, xung đột với Dialog → sau khi
   * đóng Dialog bằng click ngoài, body kẹt `pointer-events: none` (không bấm
   * được gì nữa). `modal={false}` để menu KHÔNG quản body → hết kẹt.
   */
  modal?: boolean;
  /**
   * Radix `onCloseAutoFocus` của Content. Truyền `(e) => e.preventDefault()` khi
   * item mở 1 input focus riêng (vd đổi tên inline) → chặn menu trả focus về
   * trigger, để input `autoFocus` giữ được focus.
   */
  onCloseAutoFocus?: (event: Event) => void;
}

const ContextMenu = forwardRef<HTMLDivElement, ContextMenuProps>(
  (
    { children, options, onSelect, contentClassName, disabled, asChild, modal, onCloseAutoFocus },
    ref,
  ) => {
    const slots = styles();

    // Tone tính theo từng option (danger → icon + label đỏ). React Compiler memo JSX.
    const optionElements = useMemo(
      () =>
        options.map((option) => {
          const s = styles({ tone: option.danger ? 'danger' : 'default' });
          return (
            <ContextMenuPrimitive.Item
              key={option.key}
              className={s.item()}
              disabled={option.disabled}
              // Native title (không bọc Tooltip — tránh phá focus/keyboard của Radix menu).
              title={option.disabled ? option.hint : undefined}
              onSelect={() => onSelect?.(option)}
            >
              {option.icon && <span className={s.icon()}>{option.icon}</span>}
              <span className="flex-1">{option.label}</span>
            </ContextMenuPrimitive.Item>
          );
        }),
      [onSelect, options],
    );

    return (
      <ContextMenuPrimitive.Root modal={modal}>
        <ContextMenuPrimitive.Trigger
          asChild={asChild}
          className={asChild ? undefined : 'contents'}
          disabled={disabled}
        >
          {children}
        </ContextMenuPrimitive.Trigger>
        <ContextMenuPrimitive.Portal>
          <ContextMenuPrimitive.Content
            ref={ref}
            className={slots.content({ class: contentClassName })}
            // Xem chú thích ở `Menu`: portal của React vẫn bubble theo CÂY REACT
            // nên click trong menu chui ngược lên row cha (toggle/select nhầm).
            // Chỉ `click` — `pointerdown` phải để nguyên cho Radix đóng lớp nổi.
            onClick={(e) => e.stopPropagation()}
            onCloseAutoFocus={onCloseAutoFocus}
          >
            {optionElements}
          </ContextMenuPrimitive.Content>
        </ContextMenuPrimitive.Portal>
      </ContextMenuPrimitive.Root>
    );
  },
);

ContextMenu.displayName = 'ContextMenu';

export default ContextMenu;
