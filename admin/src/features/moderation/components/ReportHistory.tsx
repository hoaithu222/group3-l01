import { memo, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';

import { Badge, BoxPanel, EmptyState, Table } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate, statusBadge } from '@/shared/utils/format';

import {
  REPORT_REASON_LABEL,
  REPORT_RESOLUTION_LABEL,
  REPORT_TARGET_TYPE_LABEL,
} from '../constants/moderation.constants';
import type { ReportHistoryItem } from '../types/moderation.types';
import { reportDetailPath } from '../utils/report-links';

export interface ReportHistoryProps {
  history: readonly ReportHistoryItem[];
}

/** Báo cáo KHÁC liên quan tới cùng tác giả (BE loại nhóm hiện tại) — mỗi dòng dẫn sang chi tiết của nó. */
const ReportHistory = memo(function ReportHistory({ history }: ReportHistoryProps) {
  const columns = useMemo<TableColumn<ReportHistoryItem>[]>(
    () => [
      {
        key: 'target',
        header: 'Đích',
        width: 160,
        cell: (row) => (
          <Link className="truncate text-link hover:underline" to={reportDetailPath(row.id)}>
            {REPORT_TARGET_TYPE_LABEL[row.targetType]}
          </Link>
        ),
      },
      {
        key: 'reason',
        header: 'Lý do',
        cell: (row) => <span className="text-fg-2">{REPORT_REASON_LABEL[row.reason]}</span>,
      },
      {
        key: 'status',
        header: 'Trạng thái',
        width: 220,
        cell: (row) => {
          const meta = statusBadge('report', row.status);
          return (
            <div className="flex min-w-0 items-center gap-2">
              <Badge color={meta.variant} size="sm" variant="tinted">
                {meta.label}
              </Badge>
              {row.resolution && (
                <span className="truncate text-caption-12 text-fg-4">
                  {REPORT_RESOLUTION_LABEL[row.resolution]}
                </span>
              )}
            </div>
          );
        },
      },
      {
        key: 'createdAt',
        header: 'Thời gian',
        align: 'right',
        width: 140,
        cell: (row) => (
          <span className="tabular-nums text-caption-12 text-fg-3">
            {formatDate(row.createdAt, 'HH:mm DD/MM/YYYY')}
          </span>
        ),
      },
    ],
    [],
  );

  const rowKey = useCallback((row: ReportHistoryItem) => row.id, []);
  const data = useMemo(() => [...history], [history]);

  return (
    <BoxPanel border="hairline" title="Lịch sử báo cáo liên quan">
      <Table
        columns={columns}
        data={data}
        emptyMessage={
          <EmptyState size="sm" title="Chưa có báo cáo nào khác liên quan tới tác giả này" />
        }
        minWidth={640}
        pagination={false}
        rowKey={rowKey}
      />
    </BoxPanel>
  );
});

export default ReportHistory;
