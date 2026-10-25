import { memo, useCallback, useMemo } from 'react';

import { Badge, BoxPanel, Table } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate, statusBadge } from '@/shared/utils/format';

import { REPORT_REASON_LABEL } from '../constants/moderation.constants';
import type { ReportEntry } from '../types/moderation.types';

export interface ReportEntriesTableProps {
  reports: readonly ReportEntry[];
}

/**
 * Danh sách từng báo cáo trong nhóm — người báo cáo, lý do, mô tả, thời điểm. Nền tảng thấy
 * danh tính người báo cáo (README p1-08 §2 "Người báo cáo": ẩn với tác giả và người kiểm duyệt
 * phạm vi, không ẩn với nền tảng). `reporter = null` = tài khoản đã bị xoá/ẩn danh.
 */
const ReportEntriesTable = memo(function ReportEntriesTable({ reports }: ReportEntriesTableProps) {
  const columns = useMemo<TableColumn<ReportEntry>[]>(
    () => [
      {
        key: 'reporter',
        header: 'Người báo cáo',
        width: 180,
        cell: (row) =>
          row.reporter ? (
            <span className="truncate text-fg-1">{row.reporter.name}</span>
          ) : (
            <span className="text-fg-5">Tài khoản không còn</span>
          ),
      },
      {
        key: 'reason',
        header: 'Lý do',
        width: 190,
        cell: (row) => (
          <Badge color="neutral" size="sm" variant="tinted">
            {REPORT_REASON_LABEL[row.reason]}
          </Badge>
        ),
      },
      {
        key: 'description',
        header: 'Mô tả',
        cell: (row) =>
          row.description ? (
            <span className="whitespace-pre-wrap break-words text-fg-2">{row.description}</span>
          ) : (
            <span className="text-fg-5">—</span>
          ),
      },
      {
        key: 'createdAt',
        header: 'Thời gian',
        width: 140,
        cell: (row) => (
          <span className="tabular-nums text-caption-12 text-fg-3">
            {formatDate(row.createdAt, 'HH:mm DD/MM/YYYY')}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Trạng thái',
        width: 120,
        cell: (row) => {
          const meta = statusBadge('report', row.status);
          return (
            <Badge color={meta.variant} size="sm" variant="tinted">
              {meta.label}
            </Badge>
          );
        },
      },
    ],
    [],
  );

  const rowKey = useCallback((row: ReportEntry) => row.id, []);
  const data = useMemo(() => [...reports], [reports]);

  return (
    <BoxPanel border="hairline" title={`Danh sách báo cáo (${reports.length})`}>
      <Table
        columns={columns}
        data={data}
        emptyMessage="Chưa có báo cáo nào"
        minWidth={760}
        pagination={false}
        rowKey={rowKey}
      />
    </BoxPanel>
  );
});

export default ReportEntriesTable;
