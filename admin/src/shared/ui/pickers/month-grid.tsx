/**
 * month-grid — mảnh dùng chung của MỌI picker chọn theo THÁNG.
 *
 * Ba control đang dựng cùng một cái lưới: `MonthYearRangePicker` (khoảng tháng
 * xuyên năm), `MonthYearStartPicker` (mốc bắt đầu + cửa sổ N tháng) và
 * `MonthRangeFilter` (khoảng tháng trong MỘT năm). Trước khi tách file này, cả
 * ba chép nguyên si: mảng nhãn 12 tháng, 2 nút điều hướng năm, và chuỗi class
 * 4 dòng của ô tháng — tức mọi lần chỉnh tone/kích thước phải sửa ba chỗ và
 * thực tế đã lệch (một nơi ghi chú `touch:h-10` nhưng class không hề có).
 *
 * Ở đây chỉ có phần HÌNH; phần NGHĨA (tháng nào là đầu/cuối/nằm giữa) do
 * caller tính rồi truyền vào qua `startKey`/`endKey` — hai control kia hiểu
 * "khoảng" theo cách khác nhau nên không gộp được logic, chỉ gộp được giao diện.
 */

import { memo } from 'react';

import { cn } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import Text from '@/shared/ui/primitives/Text';

import { MO_LABELS, slotKey } from './month-window.utils';

// ── Thanh điều hướng năm ───────────────────────────────────────────────────────

export interface YearNavProps {
  year: number;
  onStep: (dir: -1 | 1) => void;
  /** Cho phép lùi năm. Default `true` (lịch không giới hạn). */
  canPrev?: boolean;
  /** Cho phép tiến năm. Default `true`. */
  canNext?: boolean;
  className?: string;
}

const NAV_BTN =
  'flex size-6 items-center justify-center text-fg-on-popup-muted transition-colors hover:text-fg-on-popup cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-fg-on-popup-muted';

export const YearNav = memo(function YearNav({
  year,
  onStep,
  canPrev = true,
  canNext = true,
  className,
}: YearNavProps) {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      <button
        aria-label="Năm trước"
        className={NAV_BTN}
        disabled={!canPrev}
        type="button"
        onClick={() => onStep(-1)}
      >
        <SystemIcon name="angle-left-outline" size={14} />
      </button>
      <Text className="tabular-nums text-fg-on-popup" size="tiny" weight="medium">
        {year}
      </Text>
      <button
        aria-label="Năm sau"
        className={NAV_BTN}
        disabled={!canNext}
        type="button"
        onClick={() => onStep(1)}
      >
        <SystemIcon name="angle-right-outline" size={14} />
      </button>
    </div>
  );
});

// ── Lưới 12 tháng ──────────────────────────────────────────────────────────────

export interface MonthGridProps {
  /** Năm đang hiện — dùng để quy ô thứ `i` về `slotKey`. */
  year: number;
  /** Khoá ô đầu khoảng đang tô. */
  startKey: number;
  /** Khoá ô cuối khoảng đang tô. Bằng `startKey` khi chỉ chọn 1 ô. */
  endKey: number;
  onPick: (monthIdx: number) => void;
  /** Rê chuột để xem trước khoảng — truyền `null` khi rời ô. */
  onHover?: (monthIdx: number | null) => void;
  className?: string;
}

export const MonthGrid = memo(function MonthGrid({
  year,
  startKey,
  endKey,
  onPick,
  onHover,
  className,
}: MonthGridProps) {
  return (
    <div className={cn('grid grid-cols-3 gap-1', className)}>
      {MO_LABELS.map((label, i) => {
        const key = slotKey(i, year);
        const inRange = key > startKey && key < endKey;
        const isEdge = key === startKey || key === endKey;
        return (
          <button
            key={label}
            className={cn(
              // `touch:h-10` — ô tháng là đích chạm chính của control này; 32px
              // bấm bằng đầu ngón tay là trượt sang ô bên cạnh
              // (`ipad-responsive.md §3.2`). Lưới nằm trong popover nên nới
              // chiều cao KHÔNG đụng bố cục trang, và `touch:` không bao giờ
              // khớp trên PC/laptop ⇒ desktop giữ nguyên 32px.
              'h-8 w-full text-caption-12-medium transition-colors cursor-pointer touch:h-10',
              'text-fg-on-popup-muted hover:bg-bg-2 hover:text-fg-on-popup',
              inRange && 'bg-sky-5/20 text-fg-on-popup hover:bg-sky-5/30',
              isEdge && 'bg-primary-6 text-neutral-0 hover:bg-primary-5',
            )}
            type="button"
            onClick={() => onPick(i)}
            onMouseEnter={() => onHover?.(i)}
            onMouseLeave={() => onHover?.(null)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
});
