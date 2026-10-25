/**
 * MonthYearRangePicker — chọn khoảng tháng/năm (from → to) cross-year.
 *
 * Khác `MonthYearStartPicker` (rolling 12 tháng cố định) và `MonthRangeFilter`
 * (chỉ trong 1 năm): user click tháng đầu ở năm A → điều hướng năm → click
 * tháng cuối ở năm B. Không giới hạn số năm.
 *
 * UX:
 *  - Trigger: "T{m}/{Y} – T{m'}/{Y'}" + icon calendar
 *  - Popover (solid): year toolbar (← YYYY →) + grid 3x4 months
 *  - Two-step select:
 *      1. Click tháng đầu → set pendingFrom, hiển thị highlight
 *      2. Click tháng cuối (cùng hoặc năm khác) → finalize + đóng popover
 *  - Click month < pendingFrom → reset pending về tháng mới
 *  - Hover preview highlight range trong khi đang chọn
 */

import { memo, useCallback, useMemo, useState } from 'react';

import { SystemIcon } from '@/shared/ui/icons/Icons';
import { cn } from '@/shared/utils/style/cn';

import Popover from '@/shared/ui/overlays/Popover';
import Text from '@/shared/ui/primitives/Text';
import { FIELD_HEIGHT, fieldSurface } from '@/shared/ui/inputs/field.theme';
import { slotKey } from './month-window.utils';

import { MonthGrid, YearNav } from './month-grid';

export interface MonthYearRangeValue {
  /** month: 1..12 */
  from: { month: number; year: number };
  to: { month: number; year: number };
}

export interface MonthYearRangePickerProps {
  value: MonthYearRangeValue;
  onChange: (next: MonthYearRangeValue) => void;
  error?: string;
  /** Trigger width (default 240px). */
  triggerWidth?: number;
  /** Nếu true, trigger fill 100% width của container. */
  fullWidth?: boolean;
}

/** Format "T{m}/{YYYY}" cho trigger label. */
const fmt = (m: number, y: number) => `T${m}/${y}`;

function MonthYearRangePicker({
  value,
  onChange,
  error,
  triggerWidth = 240,
  fullWidth = false,
}: MonthYearRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [displayYear, setDisplayYear] = useState(value.from.year);
  const [hover, setHover] = useState<{ monthIdx: number; year: number } | null>(null);
  const [pendingFrom, setPendingFrom] = useState<{
    monthIdx: number;
    year: number;
  } | null>(null);

  const triggerLabel = `${fmt(value.from.month, value.from.year)} – ${fmt(value.to.month, value.to.year)}`;

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) setDisplayYear(value.from.year);
      if (!next) {
        setHover(null);
        setPendingFrom(null);
      }
    },
    [value.from.year],
  );

  const handleYearStep = useCallback((dir: -1 | 1) => setDisplayYear((y) => y + dir), []);

  const handleMonthClick = useCallback(
    (monthIdx: number) => {
      const clicked = { monthIdx, year: displayYear };
      const clickedKey = slotKey(clicked.monthIdx, clicked.year);

      if (pendingFrom === null) {
        setPendingFrom(clicked);
        return;
      }

      const fromKey = slotKey(pendingFrom.monthIdx, pendingFrom.year);
      if (clickedKey < fromKey) {
        setPendingFrom(clicked);
        return;
      }

      onChange({
        from: { month: pendingFrom.monthIdx + 1, year: pendingFrom.year },
        to: { month: clicked.monthIdx + 1, year: clicked.year },
      });
      setPendingFrom(null);
      setHover(null);
      setOpen(false);
    },
    [displayYear, pendingFrom, onChange],
  );

  const { startKey, endKey } = useMemo(() => {
    if (pendingFrom !== null) {
      const fromKey = slotKey(pendingFrom.monthIdx, pendingFrom.year);
      const hoverKey = hover !== null ? slotKey(hover.monthIdx, hover.year) : fromKey;
      return {
        startKey: Math.min(fromKey, hoverKey),
        endKey: Math.max(fromKey, hoverKey),
      };
    }
    return {
      startKey: slotKey(value.from.month - 1, value.from.year),
      endKey: slotKey(value.to.month - 1, value.to.year),
    };
  }, [pendingFrom, hover, value]);

  return (
    <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
      <Popover
        align="end"
        content={
          <div className="w-56 select-none p-3">
            <YearNav className="mb-3" year={displayYear} onStep={handleYearStep} />

            <MonthGrid
              endKey={endKey}
              startKey={startKey}
              year={displayYear}
              onHover={(i) => setHover(i === null ? null : { monthIdx: i, year: displayYear })}
              onPick={handleMonthClick}
            />

            <p className="mt-2 text-center text-caption-12 text-fg-on-popup-muted">
              {pendingFrom ? 'Chọn tháng kết thúc — điều hướng năm nếu cần' : 'Chọn tháng bắt đầu'}
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
          <span>{triggerLabel}</span>
          <SystemIcon className="text-fg-4" name="calendar-outline" size={16} />
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

export default memo(MonthYearRangePicker);
