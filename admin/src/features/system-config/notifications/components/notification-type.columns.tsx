import type { TableColumn } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import { NOTIFICATION_TYPE_LABELS, reasonLabel } from '../constants/notifications.constants';

/** Một dòng bảng "Push theo loại". */
export interface NotificationTypeRow {
  type: string;
  count: number;
}

/** Cột bảng "Push theo loại" của panel số liệu thông báo (admin.md p1-07 §2.1). */
export const NOTIFICATION_TYPE_COLUMNS: TableColumn<NotificationTypeRow>[] = [
  {
    key: 'type',
    header: 'Loại thông báo',
    cell: (row) => (
      <span className="text-fg-1">{reasonLabel(NOTIFICATION_TYPE_LABELS, row.type)}</span>
    ),
  },
  {
    key: 'count',
    header: 'Số push',
    align: 'right',
    width: 110,
    cell: (row) => <span className="tabular-nums text-fg-1">{formatNumber(row.count)}</span>,
  },
];
