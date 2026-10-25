/**
 * SummaryCard — KPI / dashboard summary card (kit2).
 *
 * Figma: PMS-NEW node 1048-3763.
 *
 * Layout (left → right):
 *   ┌──────────────────────────────────────────┐
 *   │ ◇ GemIcon │ LABEL (caption, muted)       │
 *   │           │ VALUE (heading by size)      │
 *   │           │ description (optional, sub)  │
 *   └──────────────────────────────────────────┘
 *
 * Sizes (số liệu khớp `summaryCardStyles` + `AUTO_GEM_SIZE`, đừng sửa lệch):
 *   sm — compact : px-2 py-2, gem sm (40px), value text-body-14-medium
 *   md — default : px-3 py-2, gem md (56px), value text-h4-medium
 *   lg — large   : px-4 py-3, gem md (56px), value text-h3-medium
 *
 * Màu: prop `color` lái TOÀN BỘ vỏ thẻ (nền pha, viền, HUD corner, vệt chéo,
 * quầng sáng) qua 3 CSS var `--sc-a` / `--sc-e` / `--sc-glow` — xem variant
 * `color` bên dưới. Trước đây vỏ thẻ hardcode teal nên 5 màu trông y hệt nhau.
 *
 * ⚠️  `icon` MUST be a `-bold` variant — enforced via BoldSystemIconName.
 */

import { memo } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';
import { cn, twMergeFontExtend } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import type { SystemIconName } from '@/shared/ui/icons';
import GemIcon, { type GemColor, type GemSize } from '@/shared/ui/icons/GemIcon';
import HudCorners, { type HudCornerVariant } from './HudCorners';
import AnimatedNumber from '../data-display/AnimatedNumber';
import { formatNumber } from '@/shared/utils/format/format.utils';

// ── Types ──────────────────────────────────────────────────────────────────────

export type BoldSystemIconName = Extract<SystemIconName, `${string}-bold`>;

// ── Recipe ─────────────────────────────────────────────────────────────────────

const summaryCardStyles = tv(
  {
    slots: {
      root: [
        'relative flex w-full items-center overflow-hidden',
        // Viền + HUD corner + vệt chéo + quầng sáng đều đọc `--sc-a` / `--sc-e` do
        // variant `color` set → MỘT khai báo dùng chung cho cả 5 màu.
        // Viền tô ĐẶC `--sc-e`, KHÔNG pha loãng: ở 70% thì các thẻ blue/green/
        // yellow chỉ đạt tỉ số tương phản 2.2–2.6 so với nền thẻ, dưới ngưỡng 3.0
        // cho thành phần phi-chữ. Tô đặc đưa cả 5 thẻ về 3.3–9.0 — nhờ vậy nét
        // mảnh 1px vẫn đọc rõ (tương phản do MÀU quyết định, không do bề dày).
        // ⛔ KHÔNG khai `border-*` ở root: viền do <HudCorners frame> vẽ chung hệ
        // toạ độ với ngoặc góc. Root tự vẽ thêm viền là hai nét lệch 2px — đúng
        // lỗi "ô vuông dính ở góc" (xem docblock HudCorners).
        '[--hud-c:var(--sc-e)]',
        'shadow-[0_2px_8px_var(--color-popup-shadow),inset_0_0_24px_color-mix(in_srgb,var(--sc-a)_10%,transparent)]',
        'transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
        'hover:shadow-[0_0_16px_color-mix(in_srgb,var(--sc-a)_28%,transparent),inset_0_0_20px_color-mix(in_srgb,var(--sc-a)_6%,transparent)] hover:scale-[1.02]',
      ],
      iconWrap: 'relative z-10 shrink-0',
      content: 'relative z-10 flex min-w-0 flex-1 flex-col',
      label: 'text-fg-2 truncate',
      // Quầng sáng chữ CHỈ bật ở theme tối: trên nền sáng, halo màu quanh chữ gần
      // đen chỉ làm nhoè nét chứ không tôn số lên.
      value: 'text-fg-1 truncate tabular-nums dark:[text-shadow:0_0_10px_var(--sc-glow)]',
      description: 'text-fg-3 truncate',
    },
    variants: {
      /**
       * Mỗi màu CHỈ khai báo 3 biến, phần còn lại của recipe tự đọc:
       *   `--sc-a`    tone nền + quầng sáng — bậc 5, dùng chung 2 theme.
       *   `--sc-e`    tone viền + HUD corner — bậc 7 ở theme SÁNG (viền bậc 5 trên
       *               nền trắng chỉ đạt CR ~1.4 nên coi như MẤT viền), bậc 4 ở
       *               theme TỐI để nét viền nổi khỏi nền navy.
       *   `--sc-glow` quầng sáng chữ value (chỉ dùng ở theme tối).
       * `blue` trỏ họ `sky` cho khớp `GemIcon` (gem `blue` cũng vẽ bằng `sky-5`).
       */
      color: {
        blue: {
          root: '[--sc-a:var(--color-sky-5)] [--sc-e:var(--color-sky-7)] dark:[--sc-e:var(--color-sky-4)] [--sc-glow:color-mix(in_srgb,var(--color-sky-5)_35%,transparent)]',
        },
        green: {
          root: '[--sc-a:var(--color-green-5)] [--sc-e:var(--color-green-7)] dark:[--sc-e:var(--color-green-4)] [--sc-glow:color-mix(in_srgb,var(--color-green-5)_35%,transparent)]',
        },
        yellow: {
          root: '[--sc-a:var(--color-yellow-5)] [--sc-e:var(--color-yellow-7)] dark:[--sc-e:var(--color-yellow-4)] [--sc-glow:color-mix(in_srgb,var(--color-yellow-5)_35%,transparent)]',
        },
        red: {
          root: '[--sc-a:var(--color-red-5)] [--sc-e:var(--color-red-7)] dark:[--sc-e:var(--color-red-4)] [--sc-glow:color-mix(in_srgb,var(--color-red-5)_35%,transparent)]',
        },
        gray: {
          root: '[--sc-a:var(--color-neutral-5)] [--sc-e:var(--color-neutral-7)] dark:[--sc-e:var(--color-neutral-4)] [--sc-glow:color-mix(in_srgb,var(--color-neutral-5)_25%,transparent)]',
        },
      },
      size: {
        sm: {
          root: 'gap-2 px-2 py-2',
          content: 'gap-0',
          label: 'text-caption-10',
          value: 'text-body-14-medium',
          description: 'text-caption-10',
        },
        md: {
          root: 'gap-2 px-3 py-2',
          content: 'gap-0.5',
          label: 'text-caption-12',
          value: 'text-h4-medium',
          description: 'text-caption-12',
        },
        lg: {
          root: 'gap-3 px-4 py-3',
          content: 'gap-1',
          label: 'text-caption-12-medium',
          value: 'text-h3-medium',
          description: 'text-caption-12',
        },
      },
    },
    defaultVariants: { color: 'blue', size: 'md' },
  },
  { twMergeConfig: twMergeFontExtend },
);

export type SummaryCardSize = NonNullable<VariantProps<typeof summaryCardStyles>['size']>;

// ── Config maps ────────────────────────────────────────────────────────────────

const ICON_SIZE: Record<SummaryCardSize, number> = { sm: 14, md: 18, lg: 24 };
const AUTO_GEM_SIZE: Record<SummaryCardSize, GemSize> = {
  sm: 'sm',
  md: 'md',
  lg: 'md',
};

// ── Props ──────────────────────────────────────────────────────────────────────

export interface SummaryCardProps {
  color?: GemColor;
  /** Card size — controls padding, gap, gem size and value typography. Default `md`. */
  size?: SummaryCardSize;
  /** Override auto gem size derived from `size`. */
  gemSize?: GemSize;
  /** System icon inside the gem. MUST be a `-bold` variant. */
  icon: BoldSystemIconName;
  /** Caption above the value (e.g. "Tổng dự án"). */
  label: string;
  /** Primary KPI metric. */
  value: number | string;
  /** Optional secondary line under the value. */
  description?: string;
  /**
   * Số ĐẾM LÊN tới giá trị khi thẻ hiện ra, và chạy tiếp mỗi lần giá trị đổi.
   * Mặc định BẬT.
   *
   * Tắt khi thẻ nằm trong danh sách dài: 200 con số cùng chạy là nhiễu thị
   * giác, và không ai theo dõi được 200 thứ một lúc. Máy bật
   * `prefers-reduced-motion` TỰ tắt, không cần truyền gì.
   *
   * ⚠️ Chỉ có tác dụng khi `value` là SỐ. Chuỗi in thẳng — muốn vừa chạy vừa
   *    rút gọn thì truyền số thật rồi đưa cách rút gọn qua `valueFormat`.
   */
  animate?: boolean;
  /**
   * Biến số thành chuỗi hiển thị. Mặc định `formatNumber` (vi-VN, không phần lẻ).
   *
   * Rút gọn tiền: `valueFormat={(n) => formatMoneyCompactInline(n / 1e9)}`.
   *
   * ⚠️ Hàm chạy MỖI KHUNG HÌNH lúc số đang chạy — giữ nó thuần và rẻ.
   */
  valueFormat?: (value: number) => string;
  /**
   * Kiểu nhấn 4 góc — `bracket` (mặc định) · `dot` · `chamfer` · `none`.
   * `none` giữ nguyên khung viền, chỉ bỏ phần nhấn góc. Xem `HudCorners`.
   */
  corners?: HudCornerVariant;
  className?: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

const SummaryCard = memo(function SummaryCard({
  color = 'blue',
  size = 'md',
  gemSize,
  icon,
  label,
  value,
  description,
  animate = true,
  valueFormat,
  corners = 'bracket',
  className,
}: SummaryCardProps) {
  const slots = summaryCardStyles({ color, size });
  const resolvedGemSize = gemSize ?? AUTO_GEM_SIZE[size];

  return (
    <div
      className={cn(slots.root(), className)}
      style={{
        backdropFilter: 'blur(5px)',
        // Nền pha TỪ `--sc-a` vào `bg-1`/`bg-2` (2 token tự lật theme) thay cho
        // `nav-from`/`nav-to`: 2 token nav là gradient XANH LÁ của thanh điều
        // hướng, nên trước đây thẻ blue/yellow/red/gray đều ra nền xanh lá và
        // prop `color` gần như vô hình.
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--sc-a) 12%, var(--color-bg-1)), color-mix(in srgb, var(--sc-a) 4%, var(--color-bg-2)))',
      }}
    >
      {/*
        Viền + ngoặc góc HUD. Viền HAIRLINE 1px tô ĐẶC `--sc-e` (không pha loãng
        — xem ghi chú ở recipe): thẻ số liệu hay xếp thành dải 4–6 cái, nét 2px
        cộng dồn thành mảng kẻ nặng. Ngoặc góc 2px, CÙNG mép ngoài với viền nên
        đọc ra "góc được gia cố" chứ không phải hai nét lệch nhau.
      */}
      <HudCorners frame frameWidth={1} size={10} thickness={2} variant={corners} />

      {/*
        Vệt sọc chéo trang trí.

        ⛔ 4% — ĐỪNG nâng lên. Sọc là NỀN, không phải nội dung: các màn danh sách
        thật xếp 4–6 thẻ này thành một dải ngang, nên mỗi bậc alpha cộng thêm là
        nhân lên 4–6 lần trên cùng một hàng ngang tầm mắt. Bản trước để 7% và dải
        KPI đọc ra như một mảng vải kẻ chứ không phải bốn con số. 4% cũng đúng
        bằng bậc mà thẻ tổng quan của hệ PMS gốc dùng.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'repeating-linear-gradient(-45deg, transparent 0, transparent 50px, color-mix(in srgb, var(--sc-a) 4%, transparent) 50px, color-mix(in srgb, var(--sc-a) 4%, transparent) 82px)',
        }}
      />

      <div className={slots.iconWrap()}>
        <GemIcon color={color} size={resolvedGemSize}>
          <SystemIcon className="text-neutral-0" name={icon} size={ICON_SIZE[size]} />
        </GemIcon>
      </div>

      <div className={slots.content()}>
        <p className={slots.label()}>{label}</p>
        <p className={slots.value()}>
          {typeof value === 'number' ? (
            <AnimatedNumber
              disabled={!animate}
              format={valueFormat ?? formatNumber}
              value={value}
            />
          ) : (
            value
          )}
        </p>
        {description && <p className={slots.description()}>{description}</p>}
      </div>
    </div>
  );
});

SummaryCard.displayName = 'SummaryCard';

export default SummaryCard;
