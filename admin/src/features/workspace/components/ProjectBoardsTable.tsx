import { memo } from 'react';

import { COLUMN_KIND_LABELS, COLUMN_KINDS } from '@/shared/constants/column-kinds';
import { Badge, BoxPanel, Table } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate, formatNumber } from '@/shared/utils/format';

import type { ProjectBoardRow } from '../types/workspace-projects.types';
import { shortId } from '../utils/short-id.utils';

export interface ProjectBoardsTableProps {
  rows: readonly ProjectBoardRow[];
}

const COLUMNS: TableColumn<ProjectBoardRow>[] = [
  {
    key: 'name',
    header: 'Bảng',
    cell: (row) => (
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-fg-1">{row.name}</span>
        {row.archived && (
          <Badge color="neutral" variant="tinted">
            Đã lưu trữ
          </Badge>
        )}
      </div>
    ),
  },
  {
    key: 'code',
    header: 'Mã',
    width: 96,
    cell: (row) => <span className="font-mono text-caption-12 text-fg-3">{shortId(row.id)}</span>,
  },
  {
    key: 'columnCount',
    header: 'Số cột',
    align: 'right',
    width: 80,
    cell: (row) => <span className="tabular-nums text-fg-1">{formatNumber(row.columnCount)}</span>,
  },
  ...COLUMN_KINDS.map<TableColumn<ProjectBoardRow>>((kind) => ({
    key: kind,
    header: COLUMN_KIND_LABELS[kind],
    align: 'right',
    width: 100,
    cell: (row) => <span className="tabular-nums text-fg-1">{formatNumber(row.byKind[kind])}</span>,
  })),
  {
    key: 'updatedAt',
    header: 'Cập nhật',
    align: 'right',
    width: 140,
    cell: (row) => (
      <span className="tabular-nums text-caption-12 text-fg-3">
        {formatDate(row.updatedAt, 'HH:mm DD/MM/YYYY')}
      </span>
    ),
  },
];

const rowKey = (row: ProjectBoardRow) => row.id;

/**
 * Bảng "Bảng công việc" (p3-02 admin.md §2.1): mã rút gọn + tên bảng (metadata tổ chức — chốt hiện) +
 * số cột + số thẻ theo loại cột + cập nhật gần nhất. KHÔNG có tiêu đề thẻ.
 */
const ProjectBoardsTable = memo(function ProjectBoardsTable({ rows }: ProjectBoardsTableProps) {
  return (
    <BoxPanel border="hairline" className="h-auto" title="Bảng công việc">
      <Table
        columns={COLUMNS}
        data={[...rows]}
        emptyMessage="Nhóm chưa có bảng công việc nào"
        pagination={false}
        rowKey={rowKey}
      />
    </BoxPanel>
  );
});

export default ProjectBoardsTable;
