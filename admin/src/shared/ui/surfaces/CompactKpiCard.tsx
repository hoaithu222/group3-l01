/**
 * CompactKpiCard — compact KPI row (kit2).
 *
 * Gem icon + label bên trái, value (+ optional unit) căn phải, viền trái 2px +
 * nền gradient theo `color`. Dùng cho hàng KPI tổng quan (dispatch, site-resources…).
 *
 * Layout (`footer` thêm hàng dưới — CHỈ rộng bằng cột bên phải GemIcon, KHÔNG
 * lấn dưới icon; chiều cao card không đổi vì cột đó vẫn nằm trong khoảng cao
 * của GemIcon):
 *   layout="row" (mặc định):
 *   ┌──────────────────────────────────────────────────────┐
 *   │ ◇ GemIcon │ LABEL ........  VALUE unit  [trailing?]   │  ← border-left + gradient
 *   │           │ [footer?]                                │
 *   └──────────────────────────────────────────────────────┘
 *
 *   layout="stack" — cho dải ≥ 5 thẻ, nhãn dài không còn bị cắt cụt:
 *   ┌───────────────────────────┐
 *   │ ◇ GemIcon │ LABEL          │
 *   │           │ VALUE unit     │
 *   └───────────────────────────┘
 *
 * ⚠️  `icon` MUST be a `-bold` variant — enforced via BoldSystemIconName.
 */

import type { ReactNode } from 'react';
import { memo } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';
import { cn } from '@/shared/utils/style/cn';
import Text, { type TextSize } from '@/shared/ui/primitives/Text';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import GemIcon, { type GemColor, type GemSize } from '@/shared/ui/icons/GemIcon';
import type { BoldSystemIconName } from './SummaryCard';
import AnimatedNumber from '../data-display/AnimatedNumber';

export type CompactKpiCardSize = 'xs' | 'sm' | 'md' | 'lg';

// Preset cho các giá trị KHÔNG phải class (GemIcon/SystemIcon size là số,
// Text size là prop) — tv() chỉ lo padding/gap ở root.
interface SizePreset {
  gem: GemSize;
  systemIcon: number;
  labelText: TextSize;
  valueText: TextSize;
  unitText: TextSize;
}

const SIZE_PRESETS: Record<CompactKpiCardSize, SizePreset> = {
  /**
   * ⛔ `gem: 'sm'` (40px) — KHÔNG hạ xuống `'xs'` (32px). Bậc này KHÔNG gate
   *    theo cảm ứng nên mọi thay đổi ở đây đổ xuống MỌI máy: gem 32px làm thẻ
   *    thấp đi ~8px và lệch hàng với các thẻ cùng dải dựng bằng component khác.
   *    Muốn dải KPI gọn hơn trên màn hẹp thì gate ở nơi dùng (`max-lg:` /
   *    `touch:`), đừng sửa preset nền.
   */
  xs: { gem: 'sm', systemIcon: 14, labelText: 'tiny', valueText: 'medium', unitText: 'extraTiny' },
  sm: { gem: 'sm', systemIcon: 16, labelText: 'small', valueText: 'medium', unitText: 'extraTiny' },
  md: { gem: 'sm', systemIcon: 18, labelText: 'small', valueText: 'large', unitText: 'extraTiny' },
  lg: { gem: 'md', systemIcon: 24, labelText: 'medium', valueText: 'extraLarge', unitText: 'tiny' },
};

// emphasis="strong": nâng 1 bậc scale cho value + unit để số/nhãn đọc được từ xa
// (dashboard big-screen). Gem icon giữ nguyên để không phá chiều cao hàng KPI.
type StrongPreset = Pick<SizePreset, 'labelText' | 'valueText' | 'unitText'>;

const STRONG_PRESETS: Record<CompactKpiCardSize, StrongPreset> = {
  xs: { labelText: 'tiny', valueText: 'large', unitText: 'tiny' },
  sm: { labelText: 'small', valueText: 'large', unitText: 'tiny' },
  md: { labelText: 'small', valueText: 'extraLarge', unitText: 'tiny' },
  lg: { labelText: 'medium', valueText: 'extraLarge', unitText: 'small' },
};

const compactKpiCardStyles = tv({
  slots: {
    root: cn(
      'flex items-center border-l-2 backdrop-blur-[10px]',
      'shadow-[0_2px_8px_var(--color-popup-shadow)]',
    ),
    // `stack`: cột dọc bên PHẢI GemIcon — chứa `content` (hàng chính) + `footer`
    // tùy chọn (vd thanh tiến độ) xếp NGAY DƯỚI, cùng bề rộng, KHÔNG lấn dưới
    // icon. Khi không có footer, chỉ 1 con nên trông giống hệt hàng ngang cũ.
    // `gap-1` cố định (không theo `size`) — chỉ là khoảng cách text↔progress,
    // không phải khoảng cách giữa các phần tử chính.
    stack: 'flex min-w-0 flex-1 flex-col gap-1',
    // `content` giữ NGUYÊN layout ngang gốc (label + value + trailing).
    content: 'flex items-center',
    label: 'flex-1 truncate',
    value: 'text-fg-1 tabular-nums',
    unit: 'whitespace-nowrap text-fg-4 tabular-nums',
  },
  variants: {
    /**
     * Nhãn PHẢI khai bậc đôi `-8` (theme sáng) / `-2` (theme tối). Nền card là
     * gradient PHA (`-5/20`) nên nó lật theo theme, còn bậc `-2` thì gần trắng ở
     * CẢ hai theme: trước đây mọi màu chỉ có `-2` nên ở theme sáng nhãn đạt tỉ số
     * tương phản 1.02–1.15 — tức là biến mất hẳn (`text-contrast.md §1` yêu cầu
     * ≥ 4.5). Bậc `-8` đưa cả 4 màu về 5.09–7.43.
     * Mỗi màu dùng ĐÚNG MỘT họ token cho viền + nền + nhãn; trộn họ (viền
     * `yellow-6` + nền `accent-5`) chỉ đang trùng nhau nhờ hai token tình cờ
     * cùng #FFB700, đổi một bên là vỡ.
     */
    color: {
      blue: {
        // Họ `sky`, KHÔNG phải `primary`: `primary` trong hệ này là TÍM thương
        // hiệu → nhãn tím trên card xanh dương.
        root: 'border-l-sky-6 bg-gradient-to-r from-sky-5/20 to-sky-5/10',
        label: 'text-sky-8 dark:text-sky-2',
      },
      yellow: {
        root: 'border-l-yellow-6 bg-gradient-to-r from-yellow-5/20 to-yellow-5/10',
        label: 'text-yellow-8 dark:text-yellow-2',
      },
      green: {
        root: 'border-l-green-6 bg-gradient-to-r from-green-5/20 to-green-5/10',
        label: 'text-green-8 dark:text-green-2',
      },
      red: {
        // `to-r` như 4 màu còn lại — trước đây `to-l` làm card đỏ đổ gradient
        // ngược chiều, đứng cạnh nhau trong hàng KPI là thấy lệch ngay.
        root: 'border-l-red-6 bg-gradient-to-r from-red-5/20 to-red-5/10',
        label: 'text-red-8 dark:text-red-2',
      },
      // "Nháp" (design 4032-76801): viền + gradient neutral. Vệt tím ở đuôi
      // gradient đã bỏ — không màu nào khác trộn 2 họ, đứng trong hàng KPI thì
      // card "xám" ngả tím trông như một trạng thái riêng chứ không phải nháp.
      gray: {
        root: 'border-l-neutral-6 bg-gradient-to-r from-neutral-5/20 to-neutral-5/10',
        label: 'text-fg-2',
      },
    },
    // Gap giữ NGUYÊN số cũ — tách sang 2 slot (`root`: khoảng cách icon ↔ cột
    // nội dung; `content`: khoảng cách label/value/trailing trong hàng chính).
    size: {
      xs: { root: 'gap-2 px-2 py-1', content: 'gap-2' },
      sm: { root: 'gap-2 px-2.5 py-1.5', content: 'gap-2' },
      md: { root: 'gap-3 px-3 py-2', content: 'gap-3' },
      lg: { root: 'gap-4 px-4 py-3', content: 'gap-4' },
    },
    /** `strong`: nhãn viết hoa + tone sáng hơn, value/unit rõ nét hơn. */
    emphasis: {
      normal: {},
      strong: {
        root: 'border-l-4',
        label: 'uppercase tracking-wide',
        unit: 'text-fg-2',
      },
    },
    /**
     * Bố cục hàng chính (port từ `vci-sun-pms-fe`).
     *
     *  · `row` (mặc định) — nhãn TRÁI, số PHẢI trên cùng một dòng. Giữ nguyên
     *    mọi consumer đã có.
     *  · `stack` — nhãn TRÊN, số DƯỚI. Dùng khi thẻ hẹp (dải ≥ 5 thẻ): ở `row`,
     *    nhãn và số tranh nhau một dòng nên nhãn dài bị cắt cụt ("Người dùng …")
     *    mà người đọc không có cách nào biết mình đang thiếu chữ gì.
     *
     * ⚠️ Khai SAU `size`: `gap-0.5` ở đây phải thắng `gap-2/3/4` của `size.content`
     *    (tailwind-merge giữ class đứng sau).
     */
    layout: {
      row: {},
      stack: {
        content: 'flex-col items-start gap-0.5',
        // Nhãn thôi `flex-1` (không còn phải đẩy số sang phải) nhưng GIỮ
        // `truncate` làm chốt chặn cho nhãn quá dài ở thẻ rất hẹp.
        label: 'w-full flex-none',
      },
    },
    /** `selected`: card đang là bộ lọc active (khi dùng làm nút bấm qua `onClick`). */
    selected: {
      true: {
        root: 'shadow-[0_2px_8px_var(--color-popup-shadow),0_0_0_2px_var(--color-primary-5),0_0_16px_-2px_var(--color-primary-5)]',
      },
      false: {},
    },
  },
  // `strong` nâng nhãn thêm 1 bậc tương phản THEO TỪNG THEME: sáng thì đậm
  // xuống `-9`, tối thì sáng lên `-1`. Bản cũ chỉ có `-1` nên ở theme sáng
  // nhãn "nổi bật" lại còn mờ hơn nhãn thường.
  compoundVariants: [
    { color: 'blue', emphasis: 'strong', class: { label: 'text-sky-9 dark:text-sky-1' } },
    { color: 'yellow', emphasis: 'strong', class: { label: 'text-yellow-9 dark:text-yellow-1' } },
    { color: 'green', emphasis: 'strong', class: { label: 'text-green-9 dark:text-green-1' } },
    { color: 'red', emphasis: 'strong', class: { label: 'text-red-9 dark:text-red-1' } },
    { color: 'gray', emphasis: 'strong', class: { label: 'text-fg-1' } },
  ],
  defaultVariants: {
    color: 'blue',
    size: 'md',
    emphasis: 'normal',
    layout: 'row',
    selected: false,
  },
});

export type CompactKpiCardColor = NonNullable<VariantProps<typeof compactKpiCardStyles>['color']>;

export type CompactKpiCardEmphasis = NonNullable<
  VariantProps<typeof compactKpiCardStyles>['emphasis']
>;

export type CompactKpiCardLayout = NonNullable<VariantProps<typeof compactKpiCardStyles>['layout']>;

export interface CompactKpiCardProps {
  /** Màu skin (viền trái + gradient + nhãn) + màu gem icon. Default `blue`. */
  color?: GemColor;
  /** Kích thước card (padding + gap + icon + text scale). Default `md`. */
  size?: CompactKpiCardSize;
  /** Độ nổi bật chữ. `strong` → nhãn hoa + tone sáng, value/unit to hơn 1 bậc. Default `normal`. */
  emphasis?: CompactKpiCardEmphasis;
  /** Bố cục hàng chính: `row` nhãn-trái/số-phải (default) · `stack` nhãn trên số dưới. */
  layout?: CompactKpiCardLayout;
  /** Icon trong gem. BẮT BUỘC biến thể `-bold`. */
  icon: BoldSystemIconName;
  label: string;
  value: string | number;
  /**
   * Số ĐẾM LÊN tới giá trị khi thẻ hiện ra, và chạy tiếp mỗi lần giá trị đổi.
   * Mặc định BẬT. Máy bật `prefers-reduced-motion` tự tắt.
   *
   * ⚠️ Tắt khi thẻ này dùng làm BỘ LỌC trong một dải dài, hoặc khi giá trị đổi
   *    liên tục theo thời gian thực — số chưa chạy xong đã có giá trị mới thì
   *    người đọc không bao giờ thấy con số đứng yên để đọc.
   *
   * Chỉ có tác dụng khi `value` là SỐ; chuỗi in thẳng.
   */
  animate?: boolean;
  /**
   * Biến số thành chuỗi hiển thị. Mặc định `formatNumber` (vi-VN, không phần lẻ).
   *
   * Cùng hợp đồng với `SummaryCard.valueFormat` — hai thẻ KPI của kit phải nhận
   * số liệu theo CÙNG một cách, nếu không thì mỗi dải KPI lại phải chọn thẻ theo
   * "cái nào rút gọn được tiền" thay vì theo mật độ cần dùng.
   *
   * ⚠️ Truyền SỐ THẬT + cách rút gọn ở đây, ĐỪNG truyền chuỗi đã format sẵn vào
   *    `value`: chuỗi thì thẻ in thẳng, mất luôn hiệu ứng đếm lên.
   *
   * ⚠️ Hàm chạy MỖI KHUNG HÌNH lúc số đang chạy — giữ nó thuần và rẻ.
   */
  valueFormat?: (value: number) => string;
  /** Đơn vị hiển thị sau giá trị (vd "công văn"). */
  unit?: string;
  /** Ghi đè cỡ chữ của `unit` — mặc định nhỏ theo `size` (xem `SIZE_PRESETS`). */
  unitSize?: TextSize;
  /** Slot ngoài cùng phải — vd `<Badge>` cho delta %, trạng thái phụ. */
  trailing?: ReactNode;
  /**
   * Hàng phụ DƯỚI hàng chính — vd `<Progress>`. Chỉ rộng bằng cột nội dung
   * (KHÔNG lấn dưới `icon`) và KHÔNG cộng thêm chiều cao card nếu tổng chiều
   * cao `content + footer` vẫn nằm trong khoảng cao của GemIcon (xem docblock).
   */
  footer?: ReactNode;
  /** Card đang là bộ lọc active — chỉ có ý nghĩa khi truyền `onClick`. Default false. */
  selected?: boolean;
  /** Truyền vào → card trở thành nút bấm (vd dùng làm bộ lọc nhanh theo chỉ số). */
  onClick?: () => void;
  className?: string;
}

const CompactKpiCard = memo(
  ({
    color = 'blue',
    size = 'md',
    emphasis = 'normal',
    layout = 'row',
    icon,
    label,
    value,
    animate = true,
    valueFormat,
    unit,
    unitSize,
    trailing,
    footer,
    selected = false,
    onClick,
    className,
  }: CompactKpiCardProps) => {
    const slots = compactKpiCardStyles({ color, size, emphasis, layout, selected });
    const strong = emphasis === 'strong';
    const preset = { ...SIZE_PRESETS[size], ...(strong ? STRONG_PRESETS[size] : null) };

    const body = (
      <>
        <GemIcon color={color} size={preset.gem}>
          <SystemIcon className="text-neutral-0" name={icon} size={preset.systemIcon} />
        </GemIcon>

        <div className={slots.stack()}>
          <div className={slots.content()}>
            <Text
              className={slots.label()}
              size={preset.labelText}
              weight={strong ? 'medium' : 'normal'}
            >
              {label}
            </Text>

            <div className="flex items-baseline gap-1">
              <Text className={slots.value()} size={preset.valueText} weight="medium">
                {typeof value === 'number' ? (
                  <AnimatedNumber disabled={!animate} format={valueFormat} value={value} />
                ) : (
                  value
                )}
              </Text>
              {!!unit && (
                <Text
                  className={slots.unit()}
                  size={unitSize ?? preset.unitText}
                  weight={strong ? 'medium' : 'normal'}
                >
                  {unit}
                </Text>
              )}
            </div>

            {trailing}
          </div>

          {footer}
        </div>
      </>
    );

    if (onClick) {
      return (
        <button
          aria-pressed={selected}
          className={cn(
            slots.root(),
            'cursor-pointer text-left transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-primary-5 focus-visible:outline-offset-2',
            className,
          )}
          type="button"
          onClick={onClick}
        >
          {body}
        </button>
      );
    }

    return <div className={cn(slots.root(), className)}>{body}</div>;
  },
);

CompactKpiCard.displayName = 'CompactKpiCard';

export default CompactKpiCard;
