import { Badge, Button } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { statusBadge } from '@/shared/utils/format';

import type { OutboxEvent } from '../types/jobs.types';
import { abbreviateId, formatIso } from '../utils/jobs-format';

export interface BuildOutboxColumnsParams {
  /** `system-config:update` — thiếu thì KHÔNG có cột hành động. */
  canUpdate: boolean;
  onRequeue: (event: OutboxEvent) => void;
}

/**
 * Cột bảng outbox (admin.md p0-04 §2.3). `lastError`/`type` chỉ render dạng chữ
 * (không HTML) và cắt 1 dòng, giá trị đầy đủ nằm ở `title`.
 */
export function buildOutboxColumns({
  canUpdate,
  onRequeue,
}: BuildOutboxColumnsParams): TableColumn<OutboxEvent>[] {
  const columns: TableColumn<OutboxEvent>[] = [
    {
      key: 'createdAt',
      header: 'Tạo lúc',
      width: 170,
      cell: (row) => (
        <span className="tabular-nums text-caption-12 text-fg-3">{formatIso(row.createdAt)}</span>
      ),
    },
    {
      key: 'type',
      header: 'Loại',
      width: 220,
      cell: (row) => (
        <span className="block truncate font-mono text-caption-12 text-fg-1" title={row.type}>
          {row.type}
        </span>
      ),
    },
    {
      key: 'aggregate',
      header: 'Aggregate',
      width: 190,
      cell: (row) => (
        <span
          className="block truncate font-mono text-caption-12 text-fg-2"
          title={`${row.aggregateType}#${row.aggregateId}`}
        >
          {row.aggregateType}#{abbreviateId(row.aggregateId)}
        </span>
      ),
    },
    {
      key: 'queueJob',
      header: 'Hàng đợi · Job',
      width: 240,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <Badge size="sm" variant="tinted">
            {row.queue}
          </Badge>
          <span className="truncate text-caption-12 text-fg-2" title={row.jobName}>
            {row.jobName}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 120,
      cell: (row) => {
        const meta = statusBadge('outbox', row.status);
        return (
          <Badge color={meta.variant} size="sm" variant="tinted">
            {meta.label}
          </Badge>
        );
      },
    },
    {
      key: 'attempts',
      header: 'Số lần thử',
      align: 'right',
      width: 100,
      cell: (row) => <span className="tabular-nums text-fg-2">{row.attempts}</span>,
    },
    {
      key: 'lastError',
      header: 'Lỗi cuối',
      cell: (row) =>
        row.lastError ? (
          <span className="block truncate text-caption-12 text-fg-2" title={row.lastError}>
            {row.lastError}
          </span>
        ) : (
          <span className="text-fg-5">—</span>
        ),
    },
  ];

  if (canUpdate) {
    columns.push({
      key: 'actions',
      header: '',
      width: 170,
      cell: (row) =>
        row.status === 'FAILED' ? (
          <div className="flex justify-end">
            <Button
              size="sm"
              startIcon={<SystemIcon name="arrows-rotate-outline" size={14} />}
              variant="ghost"
              onClick={() => onRequeue(row)}
            >
              Đưa lại hàng đợi
            </Button>
          </div>
        ) : null,
    });
  }

  return columns;
}
