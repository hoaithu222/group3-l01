import { useState, useCallback, useMemo } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { cn } from '@/shared/utils/style/cn';
import {
  buildCalendarDays,
  resolveOpenMonth,
  FOOTER_BTN_BASE,
  FOOTER_BORDER_CN,
} from './date-picker-types';
import { tryParseDate, COMMON_DATE_FORMATS } from './parse-date.utils';
import { PickerTrigger, type PickerTriggerSize } from './picker-trigger';
import { CalendarPanel } from './calendar-panel';
import Popover from '@/shared/ui/overlays/Popover';

export type SingleDatePickerSize = PickerTriggerSize;

export interface SingleDatePickerProps {
  value?: Date | null;
  onChange?: (date: Date | null) => void;
  placeholder?: string;
  format?: string;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
  invalid?: boolean;
  size?: SingleDatePickerSize;
  className?: string;
  /** Allow user to type the date inline. Default true. */
  allowManualInput?: boolean;
  /** Extra parse formats accepted in addition to the canonical `format`. */
  parseFormats?: string[];
  /** Focus input ngay khi mount → tự mở popover luôn (vd. vừa vào chế độ sửa trên lưới). Default false. */
  autoFocus?: boolean;
  /**
   * Predicate loại ngày ngoài min/max — trả true = KHOÁ ngày đó.
   * Dùng khi cần restrict theo weekday (vd. "chỉ chọn được T7") hoặc blacklist rời.
   */
  isDateDisabled?: (date: Date) => boolean;
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

export function SingleDatePicker({
  value,
  onChange,
  placeholder = 'DD/MM/YYYY',
  format = 'DD/MM/YYYY',
  minDate,
  maxDate,
  disabled = false,
  invalid = false,
  size,
  className,
  allowManualInput = true,
  parseFormats,
  autoFocus = false,
  isDateDisabled,
  id,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: SingleDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Dayjs>(() =>
    resolveOpenMonth(value, minDate, maxDate),
  );
  const [triggerError, setTriggerError] = useState(false);

  const today = useMemo(() => dayjs(), []);
  const fmt = useCallback((d: Dayjs) => d.format(format), [format]);
  const minDay = useMemo(() => (minDate ? dayjs(minDate) : null), [minDate]);
  const maxDay = useMemo(() => (maxDate ? dayjs(maxDate) : null), [maxDate]);

  // Merge canonical format with common-format fallbacks, dedupe.
  const allParseFormats = useMemo(
    () => Array.from(new Set([format, ...(parseFormats ?? COMMON_DATE_FORMATS)])),
    [format, parseFormats],
  );

  const isOff = useCallback(
    (d: Dayjs) =>
      (!!minDay && d.isBefore(minDay, 'day')) ||
      (!!maxDay && d.isAfter(maxDay, 'day')) ||
      (!!isDateDisabled && isDateDisabled(d.toDate())),
    [minDay, maxDay, isDateDisabled],
  );

  const displayText = useMemo(() => (value ? fmt(dayjs(value)) : ''), [value, fmt]);
  const calDays = useMemo(() => buildCalendarDays(viewMonth), [viewMonth]);

  const getDayClasses = useCallback(
    (date: Dayjs, isCurrentMonth: boolean) => {
      const sel = value ? dayjs(value).isSame(date, 'day') : false;
      const off = isOff(date);
      return cn(
        'h-9 w-full flex items-center justify-center text-body-14 transition-colors cursor-pointer',
        !isCurrentMonth ? 'text-fg-4' : !sel && !off && 'text-fg-1 hover:bg-bg-2',
        today.isSame(date, 'day') && !sel && 'text-primary-4 font-semibold',
        sel && 'bg-primary-6 text-neutral-0 font-semibold',
        off && 'opacity-40 cursor-not-allowed',
      );
    },
    [value, today, isOff],
  );

  const handleDayClick = useCallback(
    (date: Dayjs) => {
      if (isOff(date)) return;
      onChange?.(date.toDate());
      setTriggerError(false);
      setOpen(false);
    },
    [isOff, onChange],
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange?.(null);
      setTriggerError(false);
    },
    [onChange],
  );

  const handleToday = useCallback(() => {
    if (!isOff(today)) onChange?.(today.toDate());
    setTriggerError(false);
    setOpen(false);
  }, [isOff, today, onChange]);

  const prevMonth = useCallback(() => setViewMonth((m) => m.subtract(1, 'month')), []);
  const nextMonth = useCallback(() => setViewMonth((m) => m.add(1, 'month')), []);

  // Mở dropdown → luôn nhảy lịch về tháng của ngày đang chọn; chưa chọn thì về
  // tháng hiện tại đã kẹp trong khoảng min/max (xem `resolveOpenMonth`). Vừa thấy
  // ngay ngày đã chọn thay vì tháng đã điều hướng trước đó, vừa không mở ra một
  // tháng mà mọi ngày đều bị khoá.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) setViewMonth(resolveOpenMonth(value, minDate, maxDate));
      setOpen(next);
    },
    [value, minDate, maxDate],
  );

  // ── Inline manual typing ────────────────────────────────────────────────
  const handleTriggerInputChange = useCallback(
    (raw: string) => {
      if (!raw.trim()) {
        setTriggerError(false);
        return;
      }
      const parsed = tryParseDate(raw, allParseFormats);
      if (parsed && !isOff(parsed)) {
        // Live-sync calendar view; do NOT commit until Enter/blur.
        setViewMonth(parsed.startOf('month'));
        setTriggerError(false);
      } else {
        setTriggerError(true);
      }
    },
    [allParseFormats, isOff],
  );

  const handleTriggerInputCommit = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        onChange?.(null);
        setTriggerError(false);
        return;
      }
      const parsed = tryParseDate(trimmed, allParseFormats);
      if (!parsed || isOff(parsed)) {
        setTriggerError(true);
        return;
      }
      onChange?.(parsed.toDate());
      setViewMonth(parsed.startOf('month'));
      setTriggerError(false);
    },
    [allParseFormats, isOff, onChange],
  );

  return (
    <Popover
      align="start"
      className="w-72"
      content={
        <>
          <CalendarPanel
            calDays={calDays}
            getDayClasses={getDayClasses}
            isOff={isOff}
            viewMonth={viewMonth}
            onDayClick={handleDayClick}
            onJump={setViewMonth}
            onNextMonth={nextMonth}
            onPrevMonth={prevMonth}
          />
          <div className={cn('flex items-center justify-between px-4 py-3', FOOTER_BORDER_CN)}>
            <button
              className="text-caption-12 text-fg-4 hover:text-fg-1 transition-colors cursor-pointer"
              type="button"
              onClick={() => {
                onChange?.(null);
                setTriggerError(false);
                setOpen(false);
              }}
            >
              Xóa
            </button>
            <button
              className={cn(
                FOOTER_BTN_BASE,
                'bg-primary-6 hover:bg-primary-7',
                // Hôm nay ngoài khoảng min/max → bấm cũng không chọn được. Khoá
                // hẳn thay vì để bấm rồi không có gì xảy ra.
                isOff(today) && 'cursor-not-allowed opacity-40 hover:bg-primary-6',
              )}
              disabled={isOff(today)}
              title={isOff(today) ? 'Hôm nay nằm ngoài khoảng ngày cho phép' : undefined}
              type="button"
              onClick={handleToday}
            >
              Hôm nay
            </button>
          </div>
        </>
      }
      disabled={disabled}
      open={open}
      sideOffset={6}
      onOpenAutoFocus={(e) => e.preventDefault()}
      onOpenChange={disabled ? undefined : handleOpenChange}
    >
      <PickerTrigger
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-labelledby={ariaLabelledBy}
        autoFocus={autoFocus}
        canClear={!!value && !disabled}
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
        onRequestOpen={() => !disabled && handleOpenChange(true)}
      />
    </Popover>
  );
}
