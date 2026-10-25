import { useState, useCallback, useMemo } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { cn } from '@/shared/utils/style/cn';
import {
  buildCalendarDays,
  resolveOpenMonth,
  FOOTER_BTN_BASE,
  FOOTER_BORDER_CN,
  DEFAULT_QUICK_OPTIONS,
  type DateRange,
  type QuickSelectOption,
} from './date-picker-types';
import { tryParseDateRange, COMMON_DATE_FORMATS } from './parse-date.utils';
import { PickerTrigger, type PickerTriggerSize } from './picker-trigger';
import { CalendarPanel } from './calendar-panel';
import Popover, { type PopoverVariant } from '@/shared/ui/overlays/Popover';

export type RangeDatePickerSize = PickerTriggerSize;

export interface RangeDatePickerProps {
  range?: DateRange;
  onRangeChange?: (range: DateRange) => void;
  showQuickSelect?: boolean;
  quickSelectOptions?: QuickSelectOption[];
  placeholder?: string;
  format?: string;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
  invalid?: boolean;
  size?: RangeDatePickerSize;
  className?: string;
  /** Allow user to type the range inline (e.g. "20/06/2026 - 30/06/2026"). Default true. */
  allowManualInput?: boolean;
  /** Extra parse formats for each date in the range. */
  parseFormats?: string[];
  /** Surface panel calendar — `solid` (đục) khi nổi trên nền sáng/3D. Mặc định `glass`. */
  popoverVariant?: PopoverVariant;
  /**
   * Cạnh neo lịch so với ô nhập. Mặc định `start` (bung sang phải).
   *
   * ⚠️ Đổi sang `end` khi ô nhập nằm sát mép PHẢI của màn: lịch rộng 288px (540px khi
   * có cột chọn nhanh) bung sang phải sẽ ra ngoài khung nhìn.
   */
  align?: 'start' | 'center' | 'end';
  /** Khoảng hở tối thiểu tới mép khung nhìn khi lịch phải né va chạm (px). */
  collisionPadding?: number;
  /** Ẩn footer (dòng tóm tắt + nút Cài lại/Áp dụng). Chọn đủ 2 mốc → tự đóng. Mặc định false. */
  hideFooter?: boolean;
  /**
   * ── Trợ năng: nối với nhãn nằm NGOÀI component ────────────────────────────
   * Phần tử tương tác ở đây là `<button>` / `<div>`, không phải `<input>` thật,
   * nên `<label htmlFor>` một mình không đủ để trình đọc màn hình đọc ra tên ô.
   * Nơi dùng (vd các `*Field` của kit2 form) truyền `aria-labelledby` trỏ vào id
   * của nhãn. Tất cả đều OPTIONAL — không truyền thì hành vi y hệt trước đây.
   */
  id?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

export function RangeDatePicker({
  range,
  onRangeChange,
  showQuickSelect = false,
  quickSelectOptions = DEFAULT_QUICK_OPTIONS,
  placeholder = 'DD/MM/YYYY - DD/MM/YYYY',
  format = 'DD/MM/YYYY',
  minDate,
  maxDate,
  disabled = false,
  invalid = false,
  size,
  className,
  allowManualInput = true,
  parseFormats,
  popoverVariant,
  align = 'start',
  collisionPadding,
  hideFooter = false,
  id,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: RangeDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Dayjs>(() =>
    resolveOpenMonth(range?.from, minDate, maxDate),
  );
  const [pendingFrom, setPendingFrom] = useState<Dayjs | null>(null);
  const [hoverDate, setHoverDate] = useState<Dayjs | null>(null);
  const [triggerError, setTriggerError] = useState(false);

  const today = useMemo(() => dayjs(), []);
  const fmt = useCallback((d: Dayjs) => d.format(format), [format]);
  const minDay = useMemo(() => (minDate ? dayjs(minDate) : null), [minDate]);
  const maxDay = useMemo(() => (maxDate ? dayjs(maxDate) : null), [maxDate]);

  const allParseFormats = useMemo(
    () => Array.from(new Set([format, ...(parseFormats ?? COMMON_DATE_FORMATS)])),
    [format, parseFormats],
  );

  const isOff = useCallback(
    (d: Dayjs) => (!!minDay && d.isBefore(minDay, 'day')) || (!!maxDay && d.isAfter(maxDay, 'day')),
    [minDay, maxDay],
  );

  // Destructure before useMemo — avoids optional chaining in deps array (React Compiler warning)
  const rangeFrom = range?.from ?? null;
  const rangeTo = range?.to ?? null;

  const rFrom = useMemo(() => (rangeFrom ? dayjs(rangeFrom) : null), [rangeFrom]);
  const rTo = useMemo(() => (rangeTo ? dayjs(rangeTo) : null), [rangeTo]);

  const displayText = useMemo(() => {
    if (rFrom && rTo) return `${fmt(rFrom)} - ${fmt(rTo)}`;
    if (rFrom) return fmt(rFrom);
    return '';
  }, [rFrom, rTo, fmt]);

  const calDays = useMemo(() => buildCalendarDays(viewMonth), [viewMonth]);

  // Xoá lỗi typed khi giá trị upstream đổi (commit thành công) — so sánh prev lúc render
  // thay cho effect (tránh cascading render + rule react-hooks/set-state-in-effect).
  const [prevDisplayText, setPrevDisplayText] = useState(displayText);
  if (displayText !== prevDisplayText) {
    setPrevDisplayText(displayText);
    if (triggerError) setTriggerError(false);
  }

  const getDayClasses = useCallback(
    (date: Dayjs, isCurrentMonth: boolean) => {
      const sel =
        (rFrom?.isSame(date, 'day') ?? false) ||
        (rTo?.isSame(date, 'day') ?? false) ||
        (pendingFrom?.isSame(date, 'day') ?? false);
      const effective =
        rTo ?? (pendingFrom && hoverDate?.isAfter(pendingFrom, 'day') ? hoverDate : null);
      const inRange =
        !!rFrom && !!effective && date.isAfter(rFrom, 'day') && date.isBefore(effective, 'day');
      const off = isOff(date);
      return cn(
        'h-9 w-full flex items-center justify-center text-body-14 transition-colors cursor-pointer',
        // hover uses same bg as in-range (sky-5/20); skip hover on in-range/selected days
        !isCurrentMonth ? 'text-fg-4' : !sel && !off && !inRange && 'text-fg-1 hover:bg-sky-5/20',
        today.isSame(date, 'day') && !sel && 'text-primary-4 font-semibold',
        // Figma Timeline: rgba(56,189,248,0.2) = sky-5/20, transparent over dark bg
        inRange && 'bg-sky-5/20 text-fg-on-popup',
        sel && 'bg-primary-6 text-neutral-0 font-semibold',
        off && 'opacity-40 cursor-not-allowed',
      );
    },
    [rFrom, rTo, pendingFrom, hoverDate, today, isOff],
  );

  const handleDayClick = useCallback(
    (date: Dayjs) => {
      if (isOff(date)) return;
      if (!pendingFrom || date.isBefore(pendingFrom, 'day')) {
        setPendingFrom(date);
        onRangeChange?.({ from: date.toDate(), to: null });
      } else {
        onRangeChange?.({ from: pendingFrom.toDate(), to: date.toDate() });
        setPendingFrom(null);
        setOpen(false);
      }
    },
    [isOff, onRangeChange, pendingFrom],
  );

  const handleReset = useCallback(() => {
    onRangeChange?.({ from: null, to: null });
    setPendingFrom(null);
    setOpen(false);
  }, [onRangeChange]);

  const handleApply = useCallback(() => {
    if (pendingFrom) {
      onRangeChange?.({ from: pendingFrom.toDate(), to: null });
      setPendingFrom(null);
    }
    setOpen(false);
  }, [onRangeChange, pendingFrom]);

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRangeChange?.({ from: null, to: null });
      setPendingFrom(null);
      setTriggerError(false);
    },
    [onRangeChange],
  );

  const prevMonth = useCallback(() => setViewMonth((m) => m.subtract(1, 'month')), []);
  const nextMonth = useCallback(() => setViewMonth((m) => m.add(1, 'month')), []);
  const handleEnter = useCallback((date: Dayjs) => setHoverDate(date), []);
  const handleLeave = useCallback(() => setHoverDate(null), []);

  // ── Inline manual typing — "DD/MM/YYYY - DD/MM/YYYY" or single ─────────
  const handleTriggerInputChange = useCallback(
    (raw: string) => {
      if (!raw.trim()) {
        setTriggerError(false);
        return;
      }
      const parsed = tryParseDateRange(raw, allParseFormats);
      if (!parsed) {
        setTriggerError(true);
        return;
      }
      if (parsed.from && isOff(parsed.from)) {
        setTriggerError(true);
        return;
      }
      if (parsed.to && isOff(parsed.to)) {
        setTriggerError(true);
        return;
      }
      setTriggerError(false);
      if (parsed.from) setViewMonth(parsed.from.startOf('month'));
    },
    [allParseFormats, isOff],
  );

  const handleTriggerInputCommit = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        onRangeChange?.({ from: null, to: null });
        setPendingFrom(null);
        setTriggerError(false);
        return;
      }
      const parsed = tryParseDateRange(trimmed, allParseFormats);
      if (!parsed) {
        setTriggerError(true);
        return;
      }
      if (parsed.from && isOff(parsed.from)) {
        setTriggerError(true);
        return;
      }
      if (parsed.to && isOff(parsed.to)) {
        setTriggerError(true);
        return;
      }
      onRangeChange?.({
        from: parsed.from ? parsed.from.toDate() : null,
        to: parsed.to ? parsed.to.toDate() : null,
      });
      setPendingFrom(null);
      setTriggerError(false);
    },
    [allParseFormats, isOff, onRangeChange],
  );

  return (
    <Popover
      align={align}
      className={showQuickSelect ? 'w-[540px]' : 'w-72'}
      collisionPadding={collisionPadding}
      content={
        <div className="flex">
          {showQuickSelect && (
            <div className="flex flex-col gap-0.5 py-4 px-2 border-r border-divider-1 w-28 shrink-0">
              {quickSelectOptions.map((opt) => (
                <button
                  key={opt.label}
                  className="text-left text-body-14 text-fg-on-popup hover:bg-nav-hover-bg px-2 py-1.5 transition-colors whitespace-nowrap cursor-pointer"
                  type="button"
                  onClick={() => {
                    onRangeChange?.(opt.getRange());
                    setPendingFrom(null);
                    setOpen(false);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col flex-1 min-w-0">
            <CalendarPanel
              calDays={calDays}
              getDayClasses={getDayClasses}
              isOff={isOff}
              viewMonth={viewMonth}
              onDayClick={handleDayClick}
              onDayEnter={handleEnter}
              onDayLeave={handleLeave}
              onJump={setViewMonth}
              onNextMonth={nextMonth}
              onPrevMonth={prevMonth}
            />

            {!hideFooter && (
              <div className={cn('flex items-center justify-between px-4 py-3', FOOTER_BORDER_CN)}>
                <span className="text-caption-12 text-fg-4">
                  {rFrom ? fmt(rFrom) : 'dd/mm/yy'} - {rTo ? fmt(rTo) : 'dd/mm/yy'}
                </span>
                <div className="flex gap-3">
                  <button
                    className={cn(
                      FOOTER_BTN_BASE,
                      'bg-neutral-7 hover:bg-neutral-6 text-neutral-0',
                    )}
                    type="button"
                    onClick={handleReset}
                  >
                    Cài lại
                  </button>
                  <button
                    className={cn(FOOTER_BTN_BASE, 'bg-primary-6 hover:bg-primary-7')}
                    type="button"
                    onClick={handleApply}
                  >
                    Áp dụng
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      }
      disabled={disabled}
      open={open}
      sideOffset={6}
      variant={popoverVariant}
      onOpenAutoFocus={(e) => e.preventDefault()}
      onOpenChange={disabled ? undefined : setOpen}
    >
      <PickerTrigger
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-labelledby={ariaLabelledBy}
        canClear={!!range?.from && !disabled}
        className={className}
        disabled={disabled}
        displayText={displayText}
        editable={allowManualInput}
        id={id}
        inputError={triggerError}
        invalid={invalid}
        open={open}
        placeholder={placeholder}
        size={size}
        onClear={handleClear}
        onInputChange={handleTriggerInputChange}
        onInputCommit={handleTriggerInputCommit}
        onRequestOpen={() => !disabled && setOpen(true)}
      />
    </Popover>
  );
}
