import * as TabsPrimitive from '@radix-ui/react-tabs';
import { useRef } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';
import { twMergeFontExtend } from '@/shared/utils/style/cn';

import { useScrollActiveIntoView } from './useScrollActiveIntoView';

/**
 * Tabs — horizontal tab list powered by Radix Tabs.
 *
 * Style (Figma):
 *   - Active: border 2px primary-6 (cạnh trên/dưới theo `indicator`), text
 *     primary-6, gradient dọc sky-5/20 → sky-5/0 đổ về phía chỉ báo
 *   - Inactive: text neutral-5
 *   - Container background neutral-10
 *
 * Size axis (kit2 form standard):
 *   - `sm` → 32px (h-8)
 *   - `md` → 36px (h-9, default)
 *   - `lg` → 40px (h-10)
 *
 * Indicator axis — cạnh đặt vạch chỉ báo tab đang chọn:
 *   - `top` (mặc định) → `border-t-2`, gradient đổ xuống
 *   - `bottom` → `border-b-2`, gradient đổ lên (bám theo vạch)
 *
 * Màn hẹp — CUỘN, không ẩn, không xuống dòng (`ipad-responsive.md §4`): dải tab cuộn NGANG ngay trong
 * khung của nó (`overflow-x-auto overscroll-x-contain`, thanh cuộn ẩn), nhãn KHÔNG co (`shrink-0
 * whitespace-nowrap`) nên tab thứ 6–8 (trang cấu hình, chi tiết workspace) vẫn tới được thay vì đẩy
 * cả trang tràn ngang. Tab đang chọn tự cuộn vào tầm nhìn — mở thẳng `?tab=jobs` trên màn hẹp không
 * bị tab đang chọn nằm ngoài khung.
 *
 * Usage:
 *   <Tabs options={[...]} value={tab} onValueChange={setTab}>
 *     <TabsPanel value="key">...</TabsPanel>
 *   </Tabs>
 */
export interface TabOption {
  key: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

const styles = tv(
  {
    slots: {
      header: 'flex shrink-0 items-center justify-between gap-3',
      actions: 'flex shrink-0 items-center gap-2',
      /**
       * Cuộn ngang khi hẹp. `relative` để `offsetLeft` của tab tính từ chính dải này (xem `useScrollActiveIntoView`);
       * `min-w-0` để dải co được trong hàng `header` chứ không đẩy `right` ra khỏi khung; `scrollbar-hidden` PHẢI
       * để trần (không tiền tố biến thể — xem `dock.theme.ts`); `overscroll-x-contain` để vuốt hết dải trên Safari
       * không bị hiểu là "lùi lại trang trước".
       */
      list: [
        'relative flex min-w-0 items-start gap-2',
        'overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-hidden',
      ],
      trigger: [
        'relative inline-flex items-center gap-1 shrink-0 cursor-pointer',
        'px-3 text-body-14 whitespace-nowrap',
        'text-fg-3 outline-none transition-colors',
        'border-transparent',
        'data-[state=active]:text-primary-6 data-[state=active]:border-primary-6',
        'data-[state=active]:from-[color-mix(in_srgb,var(--color-sky-5)_20%,transparent)] data-[state=active]:to-transparent',
        'hover:text-fg-2 data-[state=active]:hover:text-primary-6',
        'data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed data-[disabled]:hover:text-fg-4',
        // `ring-inset`: dải tab là vùng cuộn (`overflow` cắt theo hộp của nó), vòng focus vẽ RA NGOÀI sẽ bị cắt mất
        // ở tab đầu/cuối và ở mép trên/dưới — vòng nằm TRONG tab thì luôn thấy đủ.
        'focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary-5',
      ],
      icon: 'shrink-0 inline-flex items-center justify-center [&>svg]:size-4',
    },
    variants: {
      size: {
        sm: { trigger: 'h-8' },
        md: { trigger: 'h-9' },
        lg: { trigger: 'h-10' },
      },
      indicator: {
        top: {
          trigger: 'border-t-2 data-[state=active]:bg-gradient-to-b',
        },
        bottom: {
          // Gradient đảo chiều để vệt sáng bám theo vạch dưới.
          trigger: 'border-b-2 data-[state=active]:bg-gradient-to-t',
          list: 'items-end',
        },
      },
    },
    defaultVariants: {
      size: 'md',
      indicator: 'top',
    },
  },
  { twMergeConfig: twMergeFontExtend },
);

type TabsVariants = VariantProps<typeof styles>;
export type TabsSize = NonNullable<TabsVariants['size']>;
export type TabsIndicator = NonNullable<TabsVariants['indicator']>;

export interface TabsProps {
  options: TabOption[];
  /**
   * Tên của CẢ dải tab (`role="tablist"`) cho trình đọc màn hình — đặt khi trang có nhiều dải tab
   * (vd trang cấu hình có dải tab chính + dải sub-tab) để phân biệt được chúng.
   */
  'aria-label'?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  size?: TabsSize;
  /** Cạnh đặt vạch chỉ báo tab đang chọn. Mặc định `top`. */
  indicator?: TabsIndicator;
  /** Hành động đặt sát mép phải, cùng hàng với tab list (vd: nút tạo mới). */
  right?: React.ReactNode;
  /** Content panels (use `TabsPanel`). */
  children?: React.ReactNode;
  /** Root wrapper className. */
  className?: string;
  /** Tab list className. */
  listClassName?: string;
  /**
   * Hàng header (tab list + `right`) className — chỉ có tác dụng khi truyền
   * `right`, vì không có `right` thì list được render trần, không có hàng bọc.
   * Dùng cho toolbar cần gạch chân / padding riêng (vd modal chi tiết công văn).
   */
  headerClassName?: string;
}

function Tabs({
  'aria-label': ariaLabel,
  options,
  value,
  defaultValue,
  onValueChange,
  size,
  indicator,
  right,
  children,
  className,
  listClassName,
  headerClassName,
}: TabsProps) {
  const slots = styles({ size, indicator });
  const listRef = useRef<HTMLDivElement>(null);
  // `value` (controlled) đổi thì đưa tab mới vào tầm nhìn; uncontrolled chỉ cần lúc mount (`defaultValue`).
  useScrollActiveIntoView(listRef, '[role="tab"][data-state="active"]', value);

  const triggerElements = options.map((option) => (
    <TabsPrimitive.Trigger
      key={option.key}
      className={slots.trigger()}
      disabled={option.disabled}
      value={option.key}
    >
      {option.icon && <span className={slots.icon()}>{option.icon}</span>}
      {option.label}
    </TabsPrimitive.Trigger>
  ));

  const listElement = (
    <TabsPrimitive.List
      ref={listRef}
      aria-label={ariaLabel}
      className={slots.list({ class: listClassName })}
    >
      {triggerElements}
    </TabsPrimitive.List>
  );

  return (
    <TabsPrimitive.Root
      className={className}
      defaultValue={defaultValue ?? options[0]?.key}
      value={value}
      onValueChange={onValueChange}
    >
      {right ? (
        <div className={slots.header({ class: headerClassName })}>
          {listElement}
          <div className={slots.actions()}>{right}</div>
        </div>
      ) : (
        listElement
      )}
      {children}
    </TabsPrimitive.Root>
  );
}

export default Tabs;
