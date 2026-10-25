import { memo } from 'react';

import { Badge, BoxPanel, Table } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import type { ReviewBoardRow } from '../types/peer-review.types';

export interface ReviewBoardsTableProps {
  rows: readonly ReviewBoardRow[];
}

const COLUMNS: TableColumn<ReviewBoardRow>[] = [
  {
    key: 'boardName',
    header: 'Bảng',
    cell: (row) => <span className="truncate text-fg-1">{row.boardName}</span>,
  },
  {
    key: 'enabled',
    header: 'Trạng thái',
    width: 120,
    cell: (row) => (
      <Badge color={row.enabled ? 'success' : 'neutral'} variant="tinted">
        {row.enabled ? 'Bật' : 'Tắt'}
      </Badge>
    ),
  },
  {
    key: 'openRounds',
    header: 'Lượt đang mở',
    align: 'right',
    width: 140,
    cell: (row) => <span className="tabular-nums text-fg-1">{formatNumber(row.openRounds)}</span>,
  },
];

const rowKey = (row: ReviewBoardRow) => row.boardId;

/**
 * Bảng "Chấm chéo theo bảng" (p4-05 admin.md §2.2): tên bảng (metadata tổ chức), bật/tắt và số lượt đang mở. KHÔNG có
 * tên người chấm, điểm, nhận xét hay tiêu đề thẻ.
 */
const ReviewBoardsTable = memo(function ReviewBoardsTable({ rows }: ReviewBoardsTableProps) {
  return (
    <BoxPanel border="hairline" className="h-auto" title="Chấm chéo theo bảng">
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

export default ReviewBoardsTable;
