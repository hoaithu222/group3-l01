/**
 * MonthYearStartPicker — chọn tháng bắt đầu (month/year) cho window 12 tháng rolling.
 *
 * Khác `MonthYearRangeField`: single-click. User click 1 tháng → window cố định
 * 12 tháng liên tiếp bắt đầu từ tháng đó. Hover highlight 12 ô liền (vắt năm).
 * Trigger hiển thị "T{m}/{YY} – T{m'}/{YY'}" cho rõ ràng (range read-only).
 */

import { memo, useCallback, useState } from 'react';

import { SystemIcon } from '@/shared/ui/icons/Icons';
import { cn } from '@/shared/utils/style/cn';
import { buildMonthWindow, formatSlotLabel, slotKey } from './month-window.utils';

import Popover from '@/shared/ui/overlays/Popover';
import Text from '@/shared/ui/primitives/Text';
import { FIELD_HEIGHT, fieldSurface } from '@/shared/ui/inputs/field.theme';

import { MonthGrid, YearNav } from './month-grid';

export interface MonthYearStartValue {
  /** 1..12 */
  month: number;
  year: number;
}

export interface MonthYearStartPickerProps {
  value: MonthYearStartValue;
  onChange: (next: MonthYearStartValue) => void;
  /** Số tháng trong window — mặc định 12 (rolling 12). */
  span?: number;
  error?: string;
  /** Trigger width (default 240px — đồng bộ MonthRangeFilter cũ). */
  triggerWidth?: number;
  /** Nếu true, trigger fill 100% width của container (override triggerWidth). */
  fullWidth?: boolean;
}

function MonthYearStartPicker({
  value,
  onChange,
  span = 12,
  error,
  triggerWidth = 240,
  fullWidth = false,
}: MonthYearStartPickerProps) {
  const [open, setOpen] = useState(false);
  const [displayYear, setDisplayYear] = useState(value.year);
  const [hover, setHover] = useState<number | null>(null);

  const window = buildMonthWindow(value.month, value.year, span);
  const lastSlot = window.slots[window.slots.length - 1];
  const triggerLabel = `${formatSlotLabel(window.slots[0], 'short')} – ${formatSlotLabel(lastSlot, 'short')}`;

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) setDisplayYear(value.year);
      if (!next) setHover(null);
    },
    [value.year],
  );

  const handleYearStep = useCallback((dir: -1 | 1) => setDisplayYear((y) => y + dir), []);

  const handleMonthClick = useCallback(
    (monthIdx: number) => {
      onChange({ month: monthIdx + 1, year: displayYear });
      setHover(null);
      setOpen(false);
    },
    [displayYear, onChange],
  );

  // Build set of slot keys cho highlight in-range
  const previewMonth = hover !== null ? hover + 1 : value.month;
  const previewYear = hover !== null ? displayYear : value.year;
  const previewWindow = buildMonthWindow(previewMonth, previewYear, span);
  const startKey = slotKey(previewWindow.slots[0].monthIdx, previewWindow.slots[0].year);
  const endKey = slotKey(
    previewWindow.slots[previewWindow.slots.length - 1].monthIdx,
    previewWindow.slots[previewWindow.slots.length - 1].year,
  );

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
              onHover={setHover}
              onPick={handleMonthClick}
            />

            <p className="mt-2 text-center text-caption-12 text-fg-on-popup-muted">
              Chọn tháng bắt đầu — window {span} tháng liên tiếp
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
            // `touch:h-10` — nút mở lịch nằm trong dải hành động của header panel
            // (`DetailPanelHeader` đã lên `touch:min-h-10`); giữ 36px là nút thấp
            // hơn hàng chứa nó và dưới sàn chạm 40px.
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

export default memo(MonthYearStartPicker);
