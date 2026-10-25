import { tv, type VariantProps } from 'tailwind-variants';
import { twMergeFontExtend } from '@/shared/utils/style/cn';
import { FIELD_POPUP_CLASS, fieldSurface } from '@/shared/ui/inputs/field.theme';

/**
 * DropdownTreeSelect recipe — trigger + popover panel.
 *
 * Bề mặt trigger (viền/nền/hover/focus/ring) và panel KHÔNG còn định nghĩa tại
 * chỗ: cả hai lấy từ `field.theme.ts` để Dropdown / MultiSelect / DatePicker /
 * TreeSelect nhìn và phản hồi y hệt nhau. Ở đây chỉ còn layout + các slot riêng
 * của tree (header/search/icon-button).
 */
export const dropdownTreeSelectStyles = tv(
  {
    slots: {
      // CHỈ layout/typography — phần còn lại do `fieldSurface` (variant `invalid`).
      trigger: [
        'inline-flex items-center justify-between gap-2 w-full min-w-[200px] cursor-pointer',
        'px-3 py-1 text-body-14 text-fg-1 text-left',
        'disabled:cursor-not-allowed disabled:opacity-50',
      ],
      content: [FIELD_POPUP_CLASS, 'w-[var(--radix-popover-trigger-width)] min-w-[240px]'],
      header: 'flex items-center gap-2 px-3 py-2 border-b border-nav-divider',
      searchInput:
        'flex-1 bg-transparent outline-none text-body-14 text-fg-on-popup placeholder:text-fg-on-popup-muted',
      iconBtn:
        'inline-flex items-center justify-center shrink-0 size-6 text-fg-on-popup-muted hover:text-fg-on-popup transition-colors cursor-pointer',
    },
    variants: {
      // GIỮ min-h (không phải h-) — trigger cao thêm khi chip xuống dòng.
      size: {
        sm: { trigger: 'min-h-8' },
        md: { trigger: 'min-h-9' },
        lg: { trigger: 'min-h-10' },
      },
      // Bề mặt dùng chung: `focus-visible` VÀ `data-[state=open]` cùng cho ra viền
      // primary + ring 2px (đỏ khi invalid). Nhánh `false` bắt buộc phải có —
      // không có nó thì trigger bình thường mất luôn viền/nền.
      invalid: {
        true: { trigger: fieldSurface({ focusMode: 'trigger', invalid: true }) },
        false: { trigger: fieldSurface({ focusMode: 'trigger', invalid: false }) },
      },
    },
    defaultVariants: { size: 'md', invalid: false },
  },
  { twMergeConfig: twMergeFontExtend },
);

type DropdownTreeSelectVariants = VariantProps<typeof dropdownTreeSelectStyles>;
export type DropdownTreeSelectSize = NonNullable<DropdownTreeSelectVariants['size']>;
