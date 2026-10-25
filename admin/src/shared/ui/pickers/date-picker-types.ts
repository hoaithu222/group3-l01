import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { cn } from '@/shared/utils/style/cn';

export interface DateRange {
  from: Date | null;
  to: Date | null;
}

export interface QuickSelectOption {
  label: string;
  getRange: () => DateRange;
}

export const VI_MONTHS = [
  'Tháng 1',
  'Tháng 2',
  'Tháng 3',
  'Tháng 4',
  'Tháng 5',
  'Tháng 6',
  'Tháng 7',
  'Tháng 8',
  'Tháng 9',
  'Tháng 10',
  'Tháng 11',
  'Tháng 12',
];

export const DAY_HEADERS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

// Figma 974:19209 / 974:19016 — clean icon-only nav button.
// p-1 + 16px icon = 24x24 hit area. Force-clear UA button defaults
// (border, bg, focus ring) so chrome doesn't render a heavy chrome box.
export const NAV_BTN_CN = cn(
  'inline-flex items-center justify-center p-1 cursor-pointer',
  'border-0 bg-transparent text-fg-3',
  'hover:text-fg-1 hover:bg-sky-5/10 transition-colors',
  'focus:outline-none focus-visible:outline-none focus-visible:ring-0',
);

// Figma 845:7084 — footer action buttons have backdrop-blur-[5px], 36px height, 120px width.
export const FOOTER_BTN_BASE =
  'relative h-9 w-[120px] text-body-14 text-neutral-0 overflow-hidden backdrop-blur-[5px] hover:opacity-90 transition-opacity cursor-pointer';

export const FOOTER_BORDER_CN =
  'border-t border-[color-mix(in_srgb,var(--color-primary-4)_20%,transparent)]';

// Luôn trả về 42 ô (6 hàng x 7 cột) để chiều cao lưới ngày cố định giữa các
// tháng — tránh popup nhảy lên/xuống khi next/prev tháng (một số tháng vốn chỉ
// cần 4-5 hàng, số khác cần 6 hàng).
export function buildCalendarDays(month: Dayjs): { date: Dayjs; isCurrentMonth: boolean }[] {
  const first = month.startOf('month');
  const last = month.endOf('month');
  const days: { date: Dayjs; isCurrentMonth: boolean }[] = [];
  for (let i = (first.day() + 6) % 7; i > 0; i--)
    days.push({ date: first.subtract(i, 'day'), isCurrentMonth: false });
  for (let d = 0; d < month.daysInMonth(); d++)
    days.push({ date: first.add(d, 'day'), isCurrentMonth: true });
  for (let i = 1; days.length < 42; i++)
    days.push({ date: last.add(i, 'day'), isCurrentMonth: false });
  return days;
}

/**
 * Tháng mà lịch mở ra: ưu tiên tháng của ngày ĐANG CHỌN; chưa chọn thì lấy tháng
 * hiện tại nhưng KẸP vào khoảng min/max — hôm nay nằm ngoài khoảng cho phép thì
 * mở thẳng ở biên gần nhất (vd ngày công việc bị giới hạn trong khoảng ngày của
 * hạng mục cha), khỏi phải bấm mũi tên đi tìm tháng có ngày bấm được.
 */
export function resolveOpenMonth(
  value?: Date | null,
  minDate?: Date | null,
  maxDate?: Date | null,
): Dayjs {
  if (value) return dayjs(value).startOf('month');
  const now = dayjs();
  if (minDate && now.isBefore(dayjs(minDate), 'day')) return dayjs(minDate).startOf('month');
  if (maxDate && now.isAfter(dayjs(maxDate), 'day')) return dayjs(maxDate).startOf('month');
  return now.startOf('month');
}

export const DEFAULT_QUICK_OPTIONS: QuickSelectOption[] = [
  {
    label: '2 tuần tới',
    getRange: () => ({ from: dayjs().toDate(), to: dayjs().add(13, 'day').toDate() }),
  },
  {
    label: 'Tháng này',
    getRange: () => ({
      from: dayjs().startOf('month').toDate(),
      to: dayjs().endOf('month').toDate(),
    }),
  },
  {
    label: 'Quý này',
    getRange: () => {
      const q = Math.floor(dayjs().month() / 3);
      return {
        from: dayjs()
          .month(q * 3)
          .startOf('month')
          .toDate(),
        to: dayjs()
          .month(q * 3 + 2)
          .endOf('month')
          .toDate(),
      };
    },
  },
  {
    label: 'Năm nay',
    getRange: () => ({
      from: dayjs().startOf('year').toDate(),
      to: dayjs().endOf('year').toDate(),
    }),
  },
  {
    label: '3 tháng',
    getRange: () => ({ from: dayjs().subtract(3, 'month').toDate(), to: dayjs().toDate() }),
  },
  {
    label: '6 tháng',
    getRange: () => ({ from: dayjs().subtract(6, 'month').toDate(), to: dayjs().toDate() }),
  },
];
