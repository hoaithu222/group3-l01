import { useState } from 'react';
import type { Dayjs } from 'dayjs';
import { cn } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { VI_MONTHS, DAY_HEADERS, NAV_BTN_CN } from './date-picker-types';

interface CalendarPanelProps {
  viewMonth: Dayjs;
  calDays: { date: Dayjs; isCurrentMonth: boolean }[];
  onPrevMonth: () => void;
  onNextMonth: () => void;
  getDayClasses: (date: Dayjs, isCurrentMonth: boolean) => string;
  onDayClick: (date: Dayjs) => void;
  onDayEnter?: (date: Dayjs) => void;
  onDayLeave?: () => void;
  isOff: (date: Dayjs) => boolean;
  /** Bật chọn nhanh tháng/năm (bấm caret cạnh tiêu đề). Bỏ trống → caret tĩnh. */
  onJump?: (date: Dayjs) => void;
}

export function CalendarPanel({
  viewMonth,
  calDays,
  onPrevMonth,
  onNextMonth,
  getDayClasses,
  onDayClick,
  onDayEnter,
  onDayLeave,
  isOff,
  onJump,
}: CalendarPanelProps) {
  const [monthView, setMonthView] = useState(false);
  const [pickYear, setPickYear] = useState(() => viewMonth.year());

  const openMonthView = () => {
    setPickYear(viewMonth.year());
    setMonthView(true);
  };
  const pickMonth = (m: number) => {
    onJump?.(viewMonth.year(pickYear).month(m).date(1));
    setMonthView(false);
  };

  return (
    <div className="flex flex-col flex-1 min-w-0">
      {/* Month header — title (+ caret quick-jump) | nav buttons */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        {onJump ? (
          <button
            className="flex items-center gap-1 text-body-16-medium text-fg-1 transition-colors hover:text-primary-4 cursor-pointer"
            type="button"
            onClick={monthView ? () => setMonthView(false) : openMonthView}
          >
            <span>
              {VI_MONTHS[viewMonth.month()]}, {viewMonth.year()}
            </span>
            <SystemIcon
              className={cn('transition-transform', monthView && 'rotate-180')}
              name="caret-large-down-outline"
              size={14}
            />
          </button>
        ) : (
          <div className="flex items-center gap-1 text-body-16-medium text-fg-1">
            <span>
              {VI_MONTHS[viewMonth.month()]}, {viewMonth.year()}
            </span>
            <SystemIcon className="text-fg-1" name="caret-large-down-outline" size={14} />
          </div>
        )}
        {!monthView && (
          <div className="flex gap-2">
            <button
              aria-label="Tháng trước"
              className={NAV_BTN_CN}
              type="button"
              onClick={onPrevMonth}
            >
              <SystemIcon name="angle-left-outline" size={14} />
            </button>
            <button
              aria-label="Tháng sau"
              className={NAV_BTN_CN}
              type="button"
              onClick={onNextMonth}
            >
              <SystemIcon name="angle-right-outline" size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Body có chiều cao cố định: header T2..CN (24px) + 6 hàng day cell (6×36)
          + pb-2 (8px) = 248px. Đảm bảo popup không nhảy khi next/prev tháng
          hoặc khi chuyển giữa day-view ↔ month-view. */}
      <div className="h-[248px]">
        {monthView ? (
          /* Chọn nhanh: stepper năm + lưới 12 tháng */
          <div className="flex h-full flex-col px-2 pb-2">
            <div className="flex items-center justify-between px-2 py-2">
              <button
                aria-label="Năm trước"
                className={NAV_BTN_CN}
                type="button"
                onClick={() => setPickYear((y) => y - 1)}
              >
                <SystemIcon name="angle-left-outline" size={14} />
              </button>
              <span className="text-body-16-medium text-fg-1 tabular-nums">{pickYear}</span>
              <button
                aria-label="Năm sau"
                className={NAV_BTN_CN}
                type="button"
                onClick={() => setPickYear((y) => y + 1)}
              >
                <SystemIcon name="angle-right-outline" size={14} />
              </button>
            </div>
            <div className="grid flex-1 grid-cols-3 grid-rows-4 gap-1">
              {VI_MONTHS.map((label, m) => {
                const sel = pickYear === viewMonth.year() && m === viewMonth.month();
                return (
                  <button
                    key={label}
                    className={cn(
                      'flex items-center justify-center text-body-14 rounded-none transition-colors cursor-pointer',
                      sel ? 'bg-primary-6 text-neutral-0 font-semibold' : 'text-fg-1 hover:bg-bg-2',
                    )}
                    type="button"
                    onClick={() => pickMonth(m)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            {/* Day-of-week labels */}
            <div className="grid grid-cols-7 px-2">
              {DAY_HEADERS.map((d) => (
                <div
                  key={d}
                  className="text-center text-caption-12-semibold text-fg-3 uppercase py-1"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Day grid — luôn 6 hàng (42 ô) để chiều cao cố định */}
            <div className="grid grid-cols-7 px-2 pb-2">
              {calDays.map(({ date, isCurrentMonth }, idx) => (
                <button
                  key={idx}
                  className={getDayClasses(date, isCurrentMonth)}
                  disabled={isOff(date)}
                  type="button"
                  onClick={() => onDayClick(date)}
                  onMouseEnter={() => onDayEnter?.(date)}
                  onMouseLeave={onDayLeave}
                >
                  {date.date()}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
