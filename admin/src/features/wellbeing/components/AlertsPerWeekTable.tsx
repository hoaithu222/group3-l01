import { memo, useMemo } from 'react';

import { Table, Text } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate } from '@/shared/utils/format';

import type { AlertsWeek } from '../types/wellbeing.types';
import { formatAlertCount, hasSuppressedCell } from '../utils/overview.utils';

export interface AlertsPerWeekTableProps {
  data: readonly AlertsWeek[];
}

/** Bảng "cảnh báo theo tuần" — bản thay thế đọc được (a11y) và chính xác của biểu đồ cột; mới nhất trước. Ô bị che hiện "—" kèm chú thích khử nhận dạng. */
const AlertsPerWeekTable = memo(function AlertsPerWeekTable({ data }: AlertsPerWeekTableProps) {
  const columns = useMemo<TableColumn<AlertsWeek>[]>(
    () => [
      {
        key: 'weekStart',
        header: 'Tuần bắt đầu',
        cell: (r) => <span className="tabular-nums">{formatDate(r.weekStart)}</span>,
      },
      {
        key: 'alerts',
        header: 'Số cảnh báo',
        align: 'right',
        cell: (r) => <span className="tabular-nums">{formatAlertCount(r.alerts)}</span>,
      },
    ],
    [],
  );
  const rows = useMemo(() => [...data].reverse(), [data]);

  return (
    <div className="flex flex-col gap-2">
      <Table
        columns={columns}
        data={rows}
        emptyMessage="Chưa có số liệu"
        pagination={false}
        rowKey={(r) => r.weekStart}
      />
      {hasSuppressedCell(data) && (
        <Text size="tiny" skin="muted">
          Ô có dấu — là tuần có rất ít cảnh báo: con số bị ẩn để không ai có thể nhận ra một cá nhân
          cụ thể.
        </Text>
      )}
    </div>
  );
});

export default AlertsPerWeekTable;
