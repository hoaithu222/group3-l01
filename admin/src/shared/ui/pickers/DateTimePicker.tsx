import { memo, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { cn } from '@/shared/utils/style/cn';
import {
  buildCalendarDays,
  FOOTER_BTN_BASE,
  FOOTER_BORDER_CN,
  resolveOpenMonth,
} from './date-picker-types';
import { PickerTrigger, type PickerTriggerSize } from './picker-trigger';
import { CalendarPanel } from './calendar-panel';
import Popover from '@/shared/ui/overlays/Popover';

const pad2 = (n: number) => n.toString().padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export type DateTimePickerSize = PickerTriggerSize;

export interface DateTimePickerProps {
  value?: Date | null;
  onChange?: (date: Date | null) => void;
  placeholder?: string;
  format?: string;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
  invalid?: boolean;
  size?: DateTimePickerSize;
  className?: string;
  /** Bước phút. Mặc định 1 → 60 giá trị. Đặt 5/15/30 để rút gọn cột phút. */
  minuteStep?: number;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = 'DD/MM/YYYY HH:mm',
  format = 'DD/MM/YYYY HH:mm',
  minDate,
  maxDate,
  disabled = false,
  invalid = false,
  size,
  className,
  minuteStep = 1,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Dayjs>(() => dayjs(value ?? undefined));
  // Kẹp vào khoảng min/max — xem `resolveOpenMonth`. Đi thẳng
  // `dayjs(value).startOf('month')` sẽ mở ra tháng mà MỌI ngày đều bị khoá khi
  // hôm nay nằm ngoài khoảng cho phép.
  const [viewMonth, setViewMonth] = useState<Dayjs>(() =>
    resolveOpenMonth(value, minDate, maxDate),
  );
  // Khi nằm trong Modal (Radix Dialog), portal vào DialogContent để cột giờ/phút
  // scroll được — nếu để portal ra body sẽ bị RemoveScroll (scroll-lock) chặn wheel.
  const [container, setContainer] = useState<HTMLElement | null>(null);

  const today = useMemo(() => dayjs(), []);
  const minDay = useMemo(() => (minDate ? dayjs(minDate) : null), [minDate]);
  const maxDay = useMemo(() => (maxDate ? dayjs(maxDate) : null), [maxDate]);
  const minutes = useMemo(
    () => Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep),
    [minuteStep],
  );

  const displayText = useMemo(() => (value ? dayjs(value).format(format) : ''), [value, format]);
  const calDays = useMemo(() => buildCalendarDays(viewMonth), [viewMonth]);

  const isOff = useCallback(
    (d: Dayjs) => (!!minDay && d.isBefore(minDay, 'day')) || (!!maxDay && d.isAfter(maxDay, 'day')),
    [minDay, maxDay],
  );

  const getDayClasses = useCallback(
    (date: Dayjs, isCurrentMonth: boolean) => {
      const sel = draft.isSame(date, 'day');
      const off = isOff(date);
      const isToday = today.isSame(date, 'day');
      return cn(
        'h-9 w-full flex items-center justify-center text-body-14 rounded-none transition-colors cursor-pointer',
        !isCurrentMonth ? 'text-fg-4' : !sel && !off && 'text-fg-1 hover:bg-bg-2',
        isToday && !sel && 'text-primary-4 font-semibold underline underline-offset-4',
        sel && 'bg-primary-6 text-neutral-0 font-semibold',
        off && 'opacity-40 cursor-not-allowed',
      );
    },
    [draft, today, isOff],
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        const nextDraft = dayjs(value ?? undefined);
        setDraft(nextDraft);
        setViewMonth(resolveOpenMonth(value, minDate, maxDate));
        setContainer(
          (document.querySelector('[role="dialog"][data-state="open"]') as HTMLElement) ?? null,
        );
      }
      setOpen(next);
    },
    [value, minDate, maxDate],
  );

  const handleDayClick = useCallback(
    (d: Dayjs) => {
      if (isOff(d)) return;
      setDraft((prev) => d.hour(prev.hour()).minute(prev.minute()));
    },
    [isOff],
  );

  const handleHour = useCallback((h: number) => setDraft((prev) => prev.hour(h)), []);
  const handleMinute = useCallback((m: number) => setDraft((prev) => prev.minute(m)), []);

  const handleNow = useCallback(() => {
    const now = dayjs();
    if (isOff(now)) return;
    setDraft(now);
    setViewMonth(now.startOf('month'));
  }, [isOff]);

  const handleConfirm = useCallback(() => {
    onChange?.(draft.second(0).millisecond(0).toDate());
    setOpen(false);
  }, [draft, onChange]);

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange?.(null);
    },
    [onChange],
  );

  const prevMonth = useCallback(() => setViewMonth((m) => m.subtract(1, 'month')), []);
  const nextMonth = useCallback(() => setViewMonth((m) => m.add(1, 'month')), []);

  return (
    <Popover
      align="start"
      className="w-[320px] rounded-none"
      container={container}
      content={
        <div className="flex flex-col rounded-none">
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
          {/* Time columns — flat, borderless lists with hairline divider */}
          {/* h-[128px] = sticky label (~20px) + 3 rows (~36px each) visible */}
          <div
            className={cn(
              'relative grid h-[128px] grid-cols-2 gap-px bg-border-1/50',
              'border-t border-b border-border-1/50',
            )}
          >
            <TimeColumn items={HOURS} label="Giờ" value={draft.hour()} onPick={handleHour} />
            <TimeColumn items={minutes} label="Phút" value={draft.minute()} onPick={handleMinute} />
          </div>
          {/* Action footer */}
          <div
            className={cn(
              'flex items-center justify-between px-2 py-1 bg-bg-2/50 rounded-none',
              FOOTER_BORDER_CN,
            )}
          >
            <button
              className={cn(
                'text-caption-10 uppercase tracking-wider text-fg-4 rounded-none cursor-pointer',
                'hover:text-primary-4 transition-colors',
              )}
              type="button"
              onClick={handleNow}
            >
              Bây giờ
            </button>
            <button
              className={cn(
                FOOTER_BTN_BASE,
                'h-6 w-auto px-4 text-caption-12 bg-primary-6 hover:bg-primary-7 rounded-none',
              )}
              type="button"
              onClick={handleConfirm}
            >
              Xác nhận
            </button>
          </div>
        </div>
      }
      disabled={disabled}
      open={open}
      sideOffset={6}
      onOpenAutoFocus={(e) => e.preventDefault()}
      onOpenChange={disabled ? undefined : handleOpenChange}
    >
      <PickerTrigger
        canClear={!!value && !disabled}
        className={className}
        disabled={disabled}
        displayText={displayText}
        icon="clock-outline"
        invalid={invalid}
        open={open}
        placeholder={placeholder}
        size={size}
        onClear={handleClear}
        onRequestOpen={() => !disabled && setOpen(true)}
      />
    </Popover>
  );
}

/**
 * Cột giờ/phút của RIÊNG `DateTimePicker` — cao hết panel, tiêu đề dính.
 *
 * Cố ý KHÔNG dùng `pickers/time-column.tsx` (bản của `TimePicker`): bản kia là
 * cột rời cao 200px với ô thưa hơn, hợp panel chỉ-có-giờ. Ở đây cột phải cao
 * bằng lịch bên cạnh nên mật độ và tiêu đề khác hẳn. Hai thiết kế, không phải
 * một bản chép.
 *
 * Hai hành vi dưới đây thì PHẢI giống bản kia — lý do ghi ngay tại chỗ.
 */
interface TimeColumnProps {
  label: string;
  items: number[];
  value: number;
  onPick: (n: number) => void;
}

const TimeColumn = memo(function TimeColumn({ label, items, value, onPick }: TimeColumnProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Đặt `scrollTop` chứ KHÔNG `scrollIntoView`: `scrollIntoView` cuộn cả tổ
  // tiên cuộn được, nên mở picker ra là trang phía sau nhảy chỗ. Cùng lý do đã
  // ghi ở `pickers/time-column.tsx`.
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-val="${value}"]`);
    if (!list || !el) return;
    list.scrollTop = Math.max(0, el.offsetTop - (list.clientHeight - el.offsetHeight) / 2);
  }, [value]);

  // Trong Modal, `react-remove-scroll` khoá `wheel` → không có handler này thì
  // cột giờ không lăn chuột được.
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.currentTarget.scrollTop += e.deltaY;
  }, []);

  return (
    <div
      ref={listRef}
      className="scrollbar-hidden relative flex h-full min-w-0 flex-col overflow-y-auto bg-bg-input rounded-none"
      onWheel={handleWheel}
    >
      {/* Sticky column label */}
      <div
        className={cn(
          'sticky top-0 z-10 py-1 text-center',
          'text-caption-10-bold uppercase tracking-widest text-fg-4',
          'bg-bg-2 border-b border-border-1',
        )}
      >
        {label}
      </div>
      {items.map((n) => {
        const sel = n === value;
        return (
          <button
            key={n}
            className={cn(
              'w-full py-2 text-center text-caption-12 transition-colors rounded-none cursor-pointer',
              'border-l-2 border-transparent',
              sel
                ? 'bg-primary-6 text-neutral-0 font-semibold border-primary-4 border-l-2'
                : 'text-fg-2 hover:bg-bg-2 hover:text-fg-1',
            )}
            data-val={n}
            type="button"
            onClick={() => onPick(n)}
          >
            {pad2(n)}
          </button>
        );
      })}
    </div>
  );
});
