import { memo, useCallback, useMemo } from 'react';

import { Badge, BoxPanel, Table } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';

import type { QueueName, QueueSummary } from '../types/jobs.types';
import { formatEpoch } from '../utils/jobs-format';

interface SchedulerRow {
  queue: QueueName;
  id: string;
  pattern: string | null;
  next: number | null;
}

export interface SchedulerTableProps {
  queues: readonly QueueSummary[];
}

/**
 * "Lịch chạy định kỳ" — gộp scheduler của mọi queue, sắp theo lần chạy tới.
 *
 * BE chỉ trả `id`/`pattern`/`next` (chưa có `every`, múi giờ) nên cột "Múi giờ"
 * của đặc tả CHƯA có dữ liệu để hiện — thêm khi BE trả thêm. Scheduler kiểu
 * `every` có `pattern: null`, hiện "Chu kỳ cố định".
 */
const SchedulerTable = memo(function SchedulerTable({ queues }: SchedulerTableProps) {
  const rows = useMemo<SchedulerRow[]>(
    () =>
      queues
        .flatMap((q) => q.schedulers.map((s) => ({ queue: q.name, ...s })))
        .sort((a, b) => (a.next ?? Infinity) - (b.next ?? Infinity)),
    [queues],
  );

  const columns = useMemo<TableColumn<SchedulerRow>[]>(
    () => [
      {
        key: 'id',
        header: 'Scheduler',
        cell: (row) => <span className="font-mono text-caption-12 text-fg-1">{row.id}</span>,
      },
      {
        key: 'queue',
        header: 'Hàng đợi',
        width: 150,
        cell: (row) => (
          <Badge size="sm" variant="tinted">
            {row.queue}
          </Badge>
        ),
      },
      {
        key: 'pattern',
        header: 'Lịch',
        width: 180,
        cell: (row) =>
          row.pattern ? (
            <span className="font-mono text-caption-12 text-fg-2">{row.pattern}</span>
          ) : (
            <span className="text-caption-12 text-fg-4">Chu kỳ cố định</span>
          ),
      },
      {
        key: 'next',
        header: 'Lần chạy tới',
        align: 'right',
        width: 180,
        cell: (row) => (
          <span className="tabular-nums text-caption-12 text-fg-3">{formatEpoch(row.next)}</span>
        ),
      },
    ],
    [],
  );

  const rowKey = useCallback((row: SchedulerRow) => `${row.queue}:${row.id}`, []);

  return (
    <BoxPanel border="hairline" className="h-auto" title="Lịch chạy định kỳ">
      <Table
        columns={columns}
        data={rows}
        emptyMessage="Chưa có lịch chạy định kỳ nào"
        pagination={false}
        rowKey={rowKey}
      />
    </BoxPanel>
  );
});

export default SchedulerTable;
