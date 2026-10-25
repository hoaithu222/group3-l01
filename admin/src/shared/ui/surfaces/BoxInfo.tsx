import type { ReactNode } from 'react';
import { cn } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import HudCorners, { type HudCornerVariant } from './HudCorners';
import { formatNumber } from '@/shared/utils/format/format.utils';

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * 8 tone của một dòng trạng thái. Tone chọn theo NGUYÊN TẮC: mọi cặp phải cách
 * nhau ΔE(Lab) ≥ 22 thì chấm 8px mới phân biệt được. Bộ cũ có 2 cặp hỏng:
 *   • `accent` = `accent-5` #FFB700 TRÙNG HỆT `warning` = `yellow-5` #FFB700
 *     (ΔE 0.0) → 8 màu thực chất chỉ còn 7. Nay `accent` dùng `orange-5`.
 *   • `primary` = `primary-5` #22C55E vs `success` = `green-5` #00E676 (ΔE
 *     13.7) — hai sắc lục sát nhau. Nay `primary` dùng `primary-3`, tách bằng
 *     độ sáng mà vẫn giữ họ màu thương hiệu.
 * Bộ hiện tại: ΔE nhỏ nhất 24.1 (teal ↔ primary).
 */
export type BoxInfoItemColor =
  | 'error' // red-5
  | 'accent' // orange-5
  | 'warning' // yellow-5
  | 'success' // green-5
  | 'primary' // primary-3
  | 'teal' // teal-5
  | 'sky' // sky-5
  | 'info'; // blue-5

export interface BoxInfoItem {
  label: string;
  value: number | string;
  /** Progress fill percentage 0–100 */
  percent: number;
  color: BoxInfoItemColor;
}

export interface BoxInfoProps {
  title: string;
  /** Optional summary row rendered at the top of the body */
  total?: { label: string; value: number | string };
  /** Status rows. Optional — bỏ qua khi dùng BoxInfo làm khung bọc `children`. */
  items?: BoxInfoItem[];
  /** Nội dung tùy ý render trong body (sau phần items, nếu có). */
  children?: ReactNode;
  onClose?: () => void;
  /**
   * Kiểu nhấn 4 góc — `bracket` (mặc định) · `dot` · `chamfer` · `none`.
   * `none` giữ nguyên khung viền, chỉ bỏ phần nhấn góc. Xem `HudCorners`.
   */
  corners?: HudCornerVariant;
  className?: string;
}

// ── Color token maps ───────────────────────────────────────────────────────────

/**
 * MỘT nguồn màu cho cả chấm · thanh tiến độ · quầng sáng. Trước đây là 3 map
 * song song (`DOT_COLOR` / `PROGRESS_GRADIENT` / `PROGRESS_GLOW`) — 24 dòng phải
 * sửa đồng bộ bằng tay, và đó đúng là chỗ `accent` bị đặt trùng `warning`.
 * Ở đây chỉ khai báo bậc GIỮA, hai bậc còn lại của gradient suy ra bên dưới.
 */
const TONE: Record<BoxInfoItemColor, { family: string; step: number }> = {
  error: { family: 'red', step: 5 },
  accent: { family: 'orange', step: 5 },
  warning: { family: 'yellow', step: 5 },
  success: { family: 'green', step: 5 },
  primary: { family: 'primary', step: 3 },
  teal: { family: 'teal', step: 5 },
  sky: { family: 'sky', step: 5 },
  info: { family: 'blue', step: 5 },
};

/** `var(--color-{family}-{step + delta})`, kẹp trong thang 1–10 của hệ token. */
function toneVar(color: BoxInfoItemColor, delta = 0): string {
  const { family, step } = TONE[color];
  return `var(--color-${family}-${Math.min(10, Math.max(1, step + delta))})`;
}

// ── Helper ─────────────────────────────────────────────────────────────────────

/** `percent` là dữ liệu ngoài — kẹp về 0–100 (và NaN → 0) trước khi đổ vào width. */
function clampPercent(p: number): number {
  return Number.isFinite(p) ? Math.min(100, Math.max(0, p)) : 0;
}

function formatValue(v: number | string): string {
  // KHÔNG dùng `v.toLocaleString()`: không truyền locale thì nó đọc locale của
  // trình duyệt, nên cùng một bản build sẽ hiện "1,234" trên máy en-US và
  // "1.234" trên máy vi-VN. `formatNumber` chốt 'vi-VN' và chặn cả NaN.
  return typeof v === 'number' ? formatNumber(v) : v;
}

// ── Component ──────────────────────────────────────────────────────────────────

function BoxInfo({
  title,
  total,
  items = [],
  children,
  onClose,
  corners = 'bracket',
  className,
}: BoxInfoProps) {
  return (
    <div
      className={cn(
        'relative flex w-full flex-col overflow-hidden shadow-[0_2px_8px_var(--color-popup-shadow),inset_0_0_20px_color-mix(in_srgb,var(--color-teal-5)_6%,transparent)]',
        // ⛔ KHÔNG khai `border-*` ở đây. Viền do <HudCorners frame> vẽ, cùng
        // gốc toạ độ với 4 ngoặc góc — thêm border của riêng root là hai nét
        // lệch nhau 2px, đúng lỗi "ô vuông dính ở góc" đã sửa (xem HudCorners).
        //
        // Nét viền chỉ 1px nên MÀU phải gánh phần tương phản: bậc đôi (teal-7 ở
        // theme sáng · teal-5 ở theme tối) cho tỉ số 3.15 / 3.47 — vừa qua ngưỡng
        // 3.0 cho thành phần phi-chữ. Bản cũ dùng `teal-5/40` cho cả hai theme:
        // trên nền trắng chỉ còn ~1.4, tức coi như MẤT viền.
        // (Tương phản phụ thuộc MÀU chứ không phải bề dày, nên mỏng đi 2px→1px
        // không hạ tỉ số — chỉ nhẹ mắt hơn.)
        '[--hud-c:var(--color-teal-5)]',
        '[--hud-frame-c:color-mix(in_srgb,var(--color-teal-7)_80%,transparent)]',
        'dark:[--hud-frame-c:color-mix(in_srgb,var(--color-teal-5)_55%,transparent)]',
        className,
      )}
      style={{
        backdropFilter: 'blur(5px)',
        // Pha teal vào `bg-1`/`bg-2` thay cho `nav-from`/`nav-to`: 2 token nav là
        // gradient XANH LÁ của thanh điều hướng, nền lục cõng viền/HUD teal là
        // hai họ màu lệch hue chồng lên nhau → panel bị đục.
        background:
          'linear-gradient(to bottom, color-mix(in srgb, var(--color-teal-5) 7%, var(--color-bg-1)), color-mix(in srgb, var(--color-teal-5) 3%, var(--color-bg-2)))',
      }}
    >
      {/* ── Viền + ngoặc góc HUD — Chinese BigData signature ───────────────── */}
      <HudCorners frame frameWidth={1} size={10} thickness={1.5} variant={corners} />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div
        className="relative shrink-0 overflow-hidden border-b border-nav-divider"
        style={{
          background:
            'linear-gradient(to left, transparent, color-mix(in srgb, var(--color-teal-5) 18%, transparent))',
        }}
      >
        {/* Diagonal stripe decorative overlay */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'repeating-linear-gradient(-45deg, transparent 0, transparent 50px, color-mix(in srgb, var(--color-teal-5) 8%, transparent) 50px, color-mix(in srgb, var(--color-teal-5) 8%, transparent) 82px)',
          }}
        />

        {/* Title + close button */}
        <div className="relative flex items-center justify-between gap-2 px-2 py-1.5">
          <div className="flex items-center gap-2">
            {/* Glow dot accent */}
            <span
              aria-hidden
              className="size-1 shrink-0 rounded-full bg-teal-5"
              style={{ boxShadow: '0 0 6px var(--color-teal-5)' }}
            />
            <p className="text-body-14-medium text-fg-1 whitespace-nowrap">{title}</p>
          </div>
          {onClose && (
            <button
              aria-label="Đóng"
              className="flex items-center justify-center text-fg-2 transition-colors hover:text-fg-1 cursor-pointer"
              type="button"
              onClick={onClose}
            >
              <SystemIcon name="xmark-outline" size={16} />
            </button>
          )}
        </div>

        {/* Gradient bottom border */}
        <div
          aria-hidden
          className="h-px w-full"
          style={{
            background:
              'linear-gradient(to right, var(--color-teal-5) 0%, color-mix(in srgb, var(--color-teal-5) 10%, transparent) 60%, transparent 100%)',
            opacity: 0.4,
          }}
        />
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 p-2">
        {/* Total summary row */}
        {total && (
          <div className="flex items-center justify-between px-1">
            <p className="text-caption-12 text-fg-2">{total.label}</p>
            <p className="text-caption-12-medium text-fg-1 tabular-nums">
              {formatValue(total.value)}
            </p>
          </div>
        )}

        {/* Status rows */}
        {items.map((item, i) => (
          <div key={i} className="flex flex-col gap-1">
            {/* Label · count · percent */}
            <div className="flex items-center gap-5 px-1">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: toneVar(item.color) }}
                />
                <p className="text-caption-12 text-fg-2 whitespace-nowrap">{item.label}</p>
              </div>
              {/* Phân cấp: số liệu đọc trước (fg-1 medium), % là bổ trợ (fg-4).
                  KHÔNG dùng `text-warning` cho %: cam là màu TRẠNG THÁI, tô cho
                  MỌI dòng thì dòng "Đã nghiệm thu" cũng hiện % cam y như dòng
                  "Quá hạn" → đọc ra thành cảnh báo giả. Màu của dòng đã do chấm
                  + thanh tiến độ cõng rồi. */}
              <p className="w-15 text-right text-caption-12-medium text-fg-1 tabular-nums">
                {formatValue(item.value)}
              </p>
              <p className="w-8 text-right text-caption-12 text-fg-4 tabular-nums">
                {item.percent}%
              </p>
            </div>

            {/* Progress bar — gradient fill + glow */}
            <div className="flex w-full items-center rounded-full overflow-hidden bg-bg-3/80 h-1.5">
              <div
                className="h-full shrink-0 rounded-full"
                style={{
                  width: `${clampPercent(item.percent)}%`,
                  background: `linear-gradient(to right, ${toneVar(item.color, 1)}, ${toneVar(item.color, -1)})`,
                  boxShadow: `0 0 4px color-mix(in srgb, ${toneVar(item.color)} 60%, transparent)`,
                }}
              />
            </div>
          </div>
        ))}
        {children}
      </div>
    </div>
  );
}

export default BoxInfo;
