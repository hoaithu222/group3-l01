import dayjs from 'dayjs';

import { Divider } from '@/shared/ui/divider';

export interface DateSeparatorProps {
  /** `YYYY-MM-DD` theo giờ THIẾT BỊ (`buildRows.ts` đã quy đổi). */
  dateKey: string;
}

/** Mốc ngày giữa danh sách tin — "Hôm nay"/"Hôm qua"/`dd/MM/yyyy` (app.md §3 Grouping). */
export function DateSeparator({ dateKey }: DateSeparatorProps) {
  const date = dayjs(dateKey);
  const today = dayjs();
  let label: string;
  if (date.isSame(today, 'day')) label = 'Hôm nay';
  else if (date.isSame(today.subtract(1, 'day'), 'day')) label = 'Hôm qua';
  else label = date.format('DD/MM/YYYY');

  return (
    <Divider className="px-md py-xs" label={label} />
  );
}
