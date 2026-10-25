/**
 * MonthRangeFilter — chọn khoảng tháng TRONG MỘT NĂM ("T3/2026 - T7/2026").
 *
 * Khác hai anh em cùng họ:
 *   `MonthYearRangePicker`  khoảng tháng VẮT QUA nhiều năm, năm tự do
 *   `MonthYearStartPicker`  chọn mốc bắt đầu, cửa sổ N tháng suy ra
 *   `MonthRangeFilter`      ← khoảng nằm gọn trong 1 năm, năm chọn từ DANH SÁCH
 *
 * Chốt "năm lấy từ danh sách" là điểm khác biệt thật sự: bộ lọc báo cáo chỉ có
 * dữ liệu vài năm, nên hai nút ◀ ▶ phải TẮT ở đầu/cuối danh sách thay vì cho
 * người dùng đi mãi tới những năm rỗng.
 *
 * UX:
 *   - Trigger: "T{x}/YYYY - T{y}/YYYY" + icon lịch, dùng chung `fieldSurface`
 *     với mọi ô nhập khác (KHÔNG tự khai viền/nền riêng).
 *   - Popover: thanh năm (◀ YYYY ▶) + lưới 12 tháng.
 *   - Chọn 2 nhịp: bấm tháng đầu → bấm tháng cuối. Bấm tháng NHỎ HƠN mốc đang
 *     chờ thì coi như bắt đầu lại từ tháng vừa bấm.
 */

import { memo, useCallback, useMemo, useState } from 'react';

import { cn } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import Popover from '@/shared/ui/overlays/Popover';
import Text from '@/shared/ui/primitives/Text';
import { FIELD_HEIGHT, fieldSurface } from '@/shared/ui/inputs/field.theme';

import { MonthGrid, YearNav } from './month-grid';
import { slotKey } from './month-window.utils';

export interface MonthRangeFilterValue {
  /** 0..11 */
  monthFrom: number;
  /** 0..11 */
  monthTo: number;
  year: number;
}

export interface MonthRangeFilterProps extends MonthRangeFilterValue {
  /** Năm khả dụng cho điều hướng (vd `[2025, 2026, 2027]`). */
  years: number[];
  onChange: (next: MonthRangeFilterValue) => void;
  /** Bề rộng trigger (px). Default 240. Bỏ qua khi `fullWidth`. */
  triggerWidth?: number;
  /** Trigger chiếm trọn bề ngang container. */
  fullWidth?: boolean;
  /** Thông báo lỗi — bật viền đỏ + hiện chữ dưới trigger. */
  error?: string;
  className?: string;
}

function MonthRangeFilter({
  monthFrom,
  monthTo,
  year,
  years,
  onChange,
  triggerWidth = 240,
  fullWidth = false,
  error,
  className,
}: MonthRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [pendingFrom, setPendingFrom] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const yearIdx = useMemo(() => years.indexOf(year), [years, year]);
  const canPrev = yearIdx > 0;
  const canNext = yearIdx >= 0 && yearIdx < years.length - 1;

  const display = `T${monthFrom + 1}/${year} - T${monthTo + 1}/${year}`;

  /** Đổi năm GIỮ NGUYÊN khoảng tháng — người dùng đang so cùng kỳ giữa các năm. */
  const handleYearStep = useCallback(
    (dir: -1 | 1) => {
      const next = years[yearIdx + dir];
      if (next === undefined) return;
      onChange({ monthFrom, monthTo, year: next });
    },
    [monthFrom, monthTo, onChange, yearIdx, years],
  );

  const handlePick = useCallback(
    (idx: number) => {
      // Nhịp 1 (hoặc bấm lùi về trước mốc đang chờ) → đặt lại mốc bắt đầu.
      if (pendingFrom === null || idx < pendingFrom) {
        setPendingFrom(idx);
        onChange({ monthFrom: idx, monthTo: idx, year });
        return;
      }
      // Nhịp 2 → chốt khoảng rồi đóng.
      onChange({ monthFrom: pendingFrom, monthTo: idx, year });
      setPendingFrom(null);
      setHoverIdx(null);
      setOpen(false);
    },
    [pendingFrom, year, onChange],
  );

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setPendingFrom(null);
      setHoverIdx(null);
    }
  }, []);

  /**
   * Khoảng đang TÔ trên lưới. Khi đang chờ nhịp 2, đuôi khoảng chạy theo con
   * trỏ (xem trước) — rê ngược lên trên mốc thì không xem trước gì cả, vì bấm
   * ở đó có nghĩa là bắt đầu lại chứ không phải chọn đuôi.
   */
  const { startKey, endKey } = useMemo(() => {
    if (pendingFrom !== null) {
      const to = hoverIdx !== null && hoverIdx > pendingFrom ? hoverIdx : pendingFrom;
      return { startKey: slotKey(pendingFrom, year), endKey: slotKey(to, year) };
    }
    return { startKey: slotKey(monthFrom, year), endKey: slotKey(monthTo, year) };
  }, [pendingFrom, hoverIdx, monthFrom, monthTo, year]);

  return (
    <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full', className)}>
      <Popover
        align="end"
        content={
          <div className="w-56 select-none p-3">
            <YearNav
              canNext={canNext}
              canPrev={canPrev}
              className="mb-3"
              year={year}
              onStep={handleYearStep}
            />

            <MonthGrid
              endKey={endKey}
              startKey={startKey}
              year={year}
              onHover={setHoverIdx}
              onPick={handlePick}
            />

            <p className="mt-2 text-center text-caption-12 text-fg-on-popup-muted">
              {pendingFrom === null ? 'Chọn tháng bắt đầu' : 'Chọn tháng kết thúc'}
            </p>
          </div>
        }
        open={open}
        sideOffset={6}
        variant="solid"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onOpenChange={handleOpenChange}
      >
        <button
          className={cn(
            fieldSurface({ focusMode: 'trigger', invalid: Boolean(error) }),
            FIELD_HEIGHT.md,
            'inline-flex items-center justify-between gap-2 px-3 cursor-pointer',
            'text-body-14 tabular-nums text-fg-1',
            fullWidth && 'w-full',
          )}
          style={fullWidth ? undefined : { width: triggerWidth }}
          type="button"
        >
          <span className="truncate">{display}</span>
          <SystemIcon className="text-fg-4 shrink-0" name="calendar-outline" size={16} />
        </button>
      </Popover>

      {error && (
        <Text size="extraTiny" skin="error">
          {error}
        </Text>
      )}
    </div>
  );
}

export default memo(MonthRangeFilter);
