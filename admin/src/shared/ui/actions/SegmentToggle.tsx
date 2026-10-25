import { useState, forwardRef, useMemo, useCallback } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';
import { twMergeFontExtend } from '@/shared/utils/style/cn';

/**
 * SegmentToggle — single-select segmented control.
 *
 * Variant axis:
 *   - `pill` (default): "Segmented Blue/1" (Figma 319:27341) — active fill `primary-6`.
 *     Dùng cho top-level view toggles nổi bật (vd: "Chart / Table" trên dashboard).
 *   - `subtle`: border container + bg-elevation active segment (bg-bg-3).
 *     Dùng cho compact toolbar/header view switchers (vd: "Cây / Sơ đồ" trong panel).
 *   - `tab`: filter tabs không container, active = solid neutral-7 + count badge
 *     bo tròn (Figma 3632:106289). Dùng cho header filter tabs (vd: Tất cả/Đã đọc/Chưa đọc).
 *     Cần badge VUÔNG → dùng `tab-v2`.
 *   - `solid`: container xám (bg-neutral-9, padding 4px) + active = solid neutral-7
 *     fill, label UPPERCASE 14px medium (Figma 4850:68029 "Segmented Gray/2").
 *     Dùng cho top-level view toggle trên header trang.
 *   - `glass`: "Segmented Gray/2" (Figma 3500:86928) — active fill `neutral-7`.
 *     Dùng cho view toggle trong header panel (vd: Hình ảnh / Danh sách).
 *   - `underline`: tab phẳng, KHÔNG container — root có 1 gạch chân dùng chung,
 *     segment active = tint nhạt + chữ primary + gạch chân riêng đè lên.
 *     Dùng khi phải khớp ngôn ngữ với 1 dải tab phẳng khác trên cùng màn hình
 *     (vd: panel bên cạnh đã dùng tab gạch chân thì đây cũng phải gạch chân).
 *
 * `pill` và `glass` dùng CHUNG geometry (container white/10 + backdrop-blur, segment
 * px 12 / py 6, icon 20, label 14px) — chỉ khác màu fill của segment active.
 *
 * Size axis: sm / md (default) / lg — điều khiển padding của `pill`/`glass`
 * (`md` = đúng Figma, cao 32px) và chiều cao của các variant còn lại.
 *
 * Skin axis (`subtle`, và `pill` với skin `primary`): màu active state.
 *   - `pill` + `primary`: active = nền tint + VIỀN xanh (thay cho fill đặc).
 *   - `neutral` (default): bg-bg-3 — original behavior.
 *   - `primary` / `sky` / `success` / `warning`: tinted light bg + matching text.
 *   - `primary-solid`: fill xanh ĐẶC (`primary-5`) + icon/label trắng — cho
 *     thanh công cụ CHỈ-ICON cần trạng thái đang-chọn đọc được ngay.
 *
 * Usage:
 *   <SegmentToggle options={[{ key, label?, icon? }]} value={v} onValueChange={setV} />
 *   <SegmentToggle variant="subtle" skin="sky" options={[...]} value={v} onValueChange={setV} />
 */
export interface SegmentOption {
  key: string;
  label?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: number | string;
  disabled?: boolean;
  /**
   * Gợi ý một câu cho segment CHỈ CÓ ICON: hiện tooltip khi rê chuột và làm nhãn
   * cho trình đọc màn hình. Đặt trên chính `<button>` nên phủ CẢ vùng bấm (kể cả
   * phần đệm quanh icon) — khác hẳn việc bọc `title` quanh riêng icon, vốn để hở
   * mép segment. Segment đã có `label` thì `title` chỉ làm tooltip, không ghi đè
   * nhãn cho trình đọc màn hình.
   */
  title?: string;
}

const styles = tv(
  {
    slots: {
      root: 'relative inline-flex items-center',
      segment: [
        'relative inline-flex items-center gap-1 shrink-0',
        'outline-none transition-colors cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'focus-visible:ring-1 focus-visible:ring-primary-5',
      ],
      icon: 'shrink-0 inline-flex items-center justify-center',
      label: 'whitespace-nowrap',
      badge:
        'inline-flex items-center justify-center min-w-5 px-1.5 py-0.5 rounded-full text-caption-12',
    },
    variants: {
      variant: {
        // Pill / Glass: geometry chung khai ở compoundVariants (§ pill+glass).
        pill: {},
        // Subtle: light border container + bg-elevation active — for compact toolbar use
        subtle: {
          root: 'overflow-hidden border border-border-1 bg-bg-2 divide-x divide-border-1',
          icon: 'size-4 [&>svg]:size-2.5',
          label: 'text-caption-10',
        },
        // Tab: filter tabs w/ count badge (Figma 3632:106289). No container; active
        // segment = solid neutral-7 fill. Badge đếm BO TRÒN (pill) — giữ `min-w-5`
        // + `px-1.5` của slot gốc để số 1 chữ ra hình tròn đều, số 2 chữ ra viên
        // thuốc. Biến thể badge VUÔNG nằm ở `tab-v2`. Dùng cho header filter tabs.
        tab: {
          root: 'gap-1',
          icon: 'size-5 [&>svg]:size-3.5',
          label: 'text-caption-12-medium uppercase',
          badge: 'text-caption-12-medium',
        },
        'tab-v2': {
          root: 'gap-1',
          icon: 'size-5 [&>svg]:size-3.5',
          label: 'text-caption-12-medium uppercase',
          badge: 'rounded-none min-w-0 px-1 py-0.5 text-caption-12-medium',
        },
        // Tab-hud: filter tab kiểu HUD — segment viền vuông góc cạnh, active tô
        // tint sky + ngoặc góc [ ] (TL + BR) + glow, khớp ngôn ngữ HudFrame.
        'tab-hud': {
          root: 'gap-1.5',
          icon: 'size-5 [&>svg]:size-3.5',
          label: 'text-caption-12-medium uppercase tracking-wide',
        },
        // Solid: gray container box + active solid neutral-7 fill (Figma "Segmented Gray/2").
        solid: {
          root: 'gap-0.5 p-1 bg-neutral-9',
          icon: 'size-5 [&>svg]:size-3.5',
          label: 'text-body-14-medium uppercase',
        },
        glass: {},
        /**
         * Underline: tab phẳng, ăn khớp với thanh header của panel — KHÔNG
         * container nổi, KHÔNG viền quanh segment. Root có 1 gạch chân DÙNG
         * CHUNG `border-b-2`; segment active tô nền tint mờ + chữ primary +
         * gạch chân RIÊNG đè lên đúng vị trí gạch chung, dày hơn (h-0.5) nên
         * luôn nổi rõ segment nào đang chọn.
         *
         * Dùng khi 1 SegmentToggle đứng cùng màn với 1 dải tab phẳng khác
         * (panel bên cạnh, hoặc chính route con) — hai chỗ phải cùng ngôn ngữ
         * "đang ở tab nào" thay vì một bên là nút nổi, một bên là gạch chân.
         */
        underline: {
          root: 'w-full gap-0 border-b-2 border-border-2 bg-transparent p-0',
          segment: 'justify-center gap-1.5 rounded-none',
          icon: 'size-4 [&>svg]:size-4',
          label: 'text-body-14-medium',
        },
      },
      active: {
        true: {},
        false: {},
      },
      hasLabel: {
        true: {},
        false: {},
      },
      size: {
        sm: { segment: 'h-6' },
        md: { segment: 'h-7' },
        lg: { segment: 'h-8' },
      },
      // Skin: màu active (chỉ subtle). Default neutral = giữ behavior gốc.
      skin: {
        neutral: {},
        primary: {},
        'primary-solid': {},
        sky: {},
        success: {},
        warning: {},
      },
      // Trải đều: root chiếm full width, mỗi segment flex-1 + canh giữa.
      fullWidth: {
        true: { root: 'w-full', segment: 'flex-1 justify-center' },
        false: {},
      },
      /**
       * Ép root chỉ rộng bằng tổng chiều rộng segment (theo text/icon), KHÔNG
       * stretch dù parent là `flex-col align-stretch`. Dùng khi SegmentToggle
       * nằm trong toolbar/header không muốn chiếm full width.
       */
      fitContent: {
        true: { root: 'w-fit self-start' },
        false: {},
      },
    },
    compoundVariants: [
      // ── pill + glass: geometry CHUNG (Figma 319:27341 · 3500:86928) ──────────
      // Hai design giống hệt nhau, chỉ khác màu fill của segment active.
      {
        variant: ['pill', 'glass'],
        class: {
          root: 'gap-0.5 p-0.5 bg-neutral-0/10 backdrop-blur-[10px]',
          segment: 'h-auto gap-1.5 justify-center',
          icon: 'size-5 [&>svg]:size-3.5',
          label: 'text-body-14-medium',
        },
      },
      // size → padding (h-auto ở trên nên chiều cao do padding quyết định)
      { variant: ['pill', 'glass'], size: 'sm', class: { segment: 'px-2.5 py-1' } },
      { variant: ['pill', 'glass'], size: 'md', class: { segment: 'px-3 py-1.5' } },
      { variant: ['pill', 'glass'], size: 'lg', class: { segment: 'px-3.5 py-2' } },
      // active/inactive dùng chung — trừ màu fill (khai riêng bên dưới)
      {
        variant: ['pill', 'glass'],
        active: true,
        class: { label: 'text-body-14-semibold', badge: 'bg-neutral-0 text-caption-12-medium' },
      },
      {
        variant: ['pill', 'glass'],
        active: false,
        class: {
          segment: 'text-fg-3 hover:text-fg-1',
          badge: 'bg-neutral-6 text-neutral-0',
        },
      },
      // fill riêng: pill → primary-6 · glass → neutral-7
      {
        variant: 'pill',
        active: true,
        class: { segment: 'bg-primary-6 text-neutral-0', badge: 'text-primary-6' },
      },
      {
        variant: 'glass',
        active: true,
        class: { segment: 'bg-neutral-7 text-neutral-0', badge: 'text-fg-5' },
      },
      /**
       * `pill` + skin CÓ MÀU → KHOANH VIỀN thay vì đổ đặc: nền tint nhạt +
       * viền cùng tông. Dùng cho bộ lọc đứng ngay trên một danh sách — mảng
       * đặc ở đó hút mắt hơn chính nội dung nó đang lọc.
       *
       * `ring-inset` chứ KHÔNG `border`: viền nằm trong hộp nên segment giữ
       * nguyên kích thước, không lệch 1px so với segment còn lại.
       *
       * Skin mặc định là `neutral` và KHÔNG có entry ở đây, nên mọi `pill`
       * đang dùng vẫn giữ nguyên fill đặc — muốn thêm sky/success/warning thì
       * chép thêm entry, mỗi skin 4 dòng.
       */
      {
        variant: 'pill',
        active: true,
        skin: 'primary',
        class: {
          segment: 'bg-primary-5/12 text-primary-5 ring-1 ring-inset ring-primary-5',
          badge: 'bg-primary-5 text-neutral-0',
        },
      },

      // ── underline: auto-height via py (overrides size h-*, cùng cách `subtle`
      // làm ở dưới) ─────────────────────────────────────────────────────────
      { variant: 'underline', class: { segment: 'h-auto px-2 py-2' } },

      // ── underline: active = tint nền + chữ primary + gạch chân riêng ────────
      // `after:` thay vì thêm `<span>` trong JSX — recipe tự đủ, không đụng
      // component render. `-bottom-0.5` kéo gạch chân RA NGOÀI viền `border-b-2`
      // của root 2px, để nó đè lên trên chứ không lọt thỏm bên trong.
      {
        variant: 'underline',
        active: true,
        class: {
          segment: [
            'bg-primary-5/8 text-primary-5',
            "after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:bg-primary-5 after:content-['']",
          ],
          badge: 'bg-primary-5 text-neutral-0',
        },
      },
      {
        variant: 'underline',
        active: false,
        class: {
          segment: 'text-fg-3 hover:bg-bg-2/60 hover:text-fg-1',
          badge: 'bg-bg-3 text-fg-3',
        },
      },

      // ── subtle: auto-height via py, fixed px (overrides size h-*) ───────────
      { variant: 'subtle', class: { segment: 'h-auto px-2.5 py-1.5' } },

      // ── subtle active / inactive ─────────────────────────────────────────────
      // Active label weight applies to every skin; the active bg/text is wired
      // per-skin below so `skin` actually takes effect (tinted convention shared
      // with Badge: bg-{color}-6/20 text-{color}-5). `neutral` keeps the original
      // bg-bg-3 elevation look.
      {
        variant: 'subtle',
        active: true,
        class: { label: 'font-medium' },
      },
      {
        variant: 'subtle',
        active: true,
        skin: 'neutral',
        class: { segment: 'bg-bg-3 text-fg-1' },
      },
      {
        variant: 'subtle',
        active: true,
        skin: 'primary',
        class: { segment: 'bg-primary-6/30 text-primary-5' },
      },
      // `primary-solid`: active = fill xanh ĐẶC + icon/label TRẮNG. Khác `primary`
      // (tinted) — dùng cho thanh công cụ CHỈ-ICON nơi cần trạng thái đang-chọn
      // đọc được ngay mà không phải so với ô bên cạnh.
      {
        variant: 'subtle',
        active: true,
        skin: 'primary-solid',
        class: { segment: 'bg-primary-5 text-neutral-0' },
      },
      {
        variant: 'subtle',
        active: true,
        skin: 'sky',
        class: { segment: 'bg-sky-6/20 text-sky-5' },
      },
      {
        variant: 'subtle',
        active: true,
        skin: 'success',
        class: { segment: 'bg-success-6/30 text-success-5' },
      },
      {
        variant: 'subtle',
        active: true,
        skin: 'warning',
        class: { segment: 'bg-warning-6/30 text-warning-5' },
      },
      {
        variant: 'subtle',
        active: false,
        class: {
          segment: 'text-fg-3 hover:text-fg-1',
          label: 'font-normal',
        },
      },

      // ── tab: segment sizing + active/inactive (filter tabs w/ count) ─────────
      {
        variant: 'tab',
        class: {
          segment: 'h-8 gap-1 px-3 py-1.5',
        },
      },
      {
        variant: 'tab',
        active: true,
        class: {
          segment: 'bg-neutral-7 text-neutral-0',
          // Số đếm trên nền TRẮNG (`neutral-0`) phải tô màu ĐẬM: `text-fg-5`
          // (#96A6BE) chỉ đạt ~2.3:1 nên số gần như mờ đi đúng lúc tab được
          // chọn. Lấy chính màu fill của segment (`neutral-7`) làm màu chữ —
          // cùng công thức với `pill` (badge `text-primary-6` trên fill
          // `primary-6`) — và nâng weight lên `semibold`.
          badge: 'bg-neutral-0 font-semibold text-neutral-7',
        },
      },
      {
        variant: 'tab',
        active: false,
        class: {
          segment: 'text-fg-3 hover:text-fg-1',
          badge: 'bg-neutral-7 text-neutral-1',
        },
      },
      {
        variant: 'tab-v2',
        class: {
          segment: 'h-8 gap-1 px-3 py-1.5',
        },
      },
      {
        variant: 'tab-v2',
        active: true,
        class: {
          segment: 'bg-neutral-7 text-neutral-0',
        },
      },
      {
        variant: 'tab-v2',
        active: false,
        class: {
          segment: 'text-fg-3 hover:text-fg-1',
        },
      },

      // ── tab-hud: viền vuông + ngoặc góc HUD (khớp HudFrame) ───────────────────
      // MỌI tab đều có khung + ngoặc góc [ ] (TL + BR, pseudo); tab active sáng lên.
      {
        variant: 'tab-hud',
        class: {
          segment: [
            'relative h-8 rounded-none border px-3.5 py-1.5',
            "before:pointer-events-none before:absolute before:left-[-1px] before:top-[-1px] before:size-2 before:border-l-2 before:border-t-2 before:content-['']",
            "after:pointer-events-none after:absolute after:bottom-[-1px] after:right-[-1px] after:size-2 after:border-b-2 after:border-r-2 after:content-['']",
          ],
        },
      },
      {
        variant: 'tab-hud',
        active: true,
        class: {
          segment: [
            'border-sky-5 bg-sky-5/10 text-sky-4',
            'shadow-[0_0_12px_-4px_var(--color-sky-5)]',
            'before:border-sky-5 after:border-sky-5',
          ],
        },
      },
      {
        variant: 'tab-hud',
        active: false,
        class: {
          segment: [
            'border-divider-1 text-fg-3 hover:border-sky-5/40 hover:text-fg-1',
            'before:border-divider-1 after:border-divider-1',
            'hover:before:border-sky-5/40 hover:after:border-sky-5/40',
          ],
        },
      },

      // ── solid: gray container, active solid neutral-7 fill ───────────────────
      {
        variant: 'solid',
        class: {
          segment: 'h-8 gap-1.5 px-3 py-1.5',
        },
      },
      {
        variant: 'solid',
        active: true,
        class: {
          segment: 'bg-neutral-7 text-neutral-0 shadow-sm',
        },
      },
      {
        variant: 'solid',
        active: false,
        class: {
          segment: 'text-fg-3 hover:text-fg-1',
        },
      },
    ],
    defaultVariants: {
      variant: 'pill',
      size: 'md',
      skin: 'neutral',
      fullWidth: false,
      fitContent: false,
    },
  },
  {
    // Báo cho tailwind-merge biết `text-body-*` / `text-caption-*` là font-size,
    // KHÔNG phải color — nếu thiếu, class màu (vd `text-primary-6`) trên cùng slot
    // `badge` sẽ nuốt mất font token. Xem `tailwind-conventions.md`.
    twMergeConfig: twMergeFontExtend,
  },
);

type SegmentToggleVariants = VariantProps<typeof styles>;
export type SegmentToggleSize = NonNullable<SegmentToggleVariants['size']>;
export type SegmentToggleVariant = NonNullable<SegmentToggleVariants['variant']>;
export type SegmentToggleSkin = NonNullable<SegmentToggleVariants['skin']>;

export interface SegmentToggleProps {
  options: SegmentOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  variant?: SegmentToggleVariant;
  size?: SegmentToggleSize;
  /** Màu active state (chỉ áp dụng cho variant `subtle`). Default `neutral`. */
  skin?: SegmentToggleSkin;
  /** Trải đều full width, mỗi segment chia đều. */
  fullWidth?: boolean;
  /**
   * Ép root chỉ rộng bằng tổng width segment (theo text/icon), KHÔNG stretch
   * dù parent là flex-col. Dùng khi muốn SegmentToggle compact trong toolbar.
   */
  fitContent?: boolean;
  disabled?: boolean;
  className?: string;
  /**
   * Tên của CẢ NHÓM nút ("Kỳ xếp hạng", "Giao diện"). Không có thì trình đọc màn hình chỉ đọc ra
   * "nhóm" rồi từng nút — không biết đang chọn CÁI GÌ. `aria-labelledby` (trỏ vào nhãn hiển thị) thắng.
   */
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

const SegmentToggle = forwardRef<HTMLDivElement, SegmentToggleProps>(
  (
    {
      options,
      value: valueProp,
      defaultValue,
      onValueChange,
      variant,
      size,
      skin,
      fullWidth,
      fitContent,
      disabled,
      className,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy,
    },
    ref,
  ) => {
    const [internalValue, setInternalValue] = useState<string | undefined>(
      defaultValue ?? options[0]?.key,
    );
    const isControlled = valueProp !== undefined;
    const value = isControlled ? valueProp : internalValue;

    const select = useCallback(
      (key: string) => {
        if (!isControlled) setInternalValue(key);
        onValueChange?.(key);
      },
      [isControlled, onValueChange],
    );

    const rootSlots = styles({ variant, fullWidth, fitContent });

    const segmentElements = useMemo(
      () =>
        options.map((option) => {
          const isActive = option.key === value;
          const hasLabel = option.label !== undefined;
          const itemSlots = styles({
            variant,
            active: isActive,
            hasLabel,
            size,
            skin,
            fullWidth,
            fitContent,
          });

          return (
            <button
              key={option.key}
              aria-label={hasLabel ? undefined : option.title}
              aria-pressed={isActive}
              className={itemSlots.segment()}
              disabled={disabled || option.disabled}
              title={option.title}
              type="button"
              onClick={() => select(option.key)}
            >
              {option.icon && <span className={itemSlots.icon()}>{option.icon}</span>}
              {hasLabel && <span className={itemSlots.label()}>{option.label}</span>}
              {option.badge !== undefined && (
                <span className={itemSlots.badge()}>{option.badge}</span>
              )}
            </button>
          );
        }),
      [options, value, disabled, select, variant, size, skin, fullWidth, fitContent],
    );

    return (
      <div
        ref={ref}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={rootSlots.root({ class: className })}
        role="group"
      >
        {segmentElements}
      </div>
    );
  },
);

SegmentToggle.displayName = 'SegmentToggle';

export default SegmentToggle;
