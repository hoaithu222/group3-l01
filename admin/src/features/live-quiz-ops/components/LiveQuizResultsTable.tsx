import { memo } from 'react';

import { Table } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import type { AdminLiveQuizResultRow } from '../types/live-quiz-ops.types';

const COLUMNS: TableColumn<AdminLiveQuizResultRow>[] = [
  {
    key: 'rank',
    header: 'Hạng',
    width: 70,
    align: 'right',
    cell: (r) => <span className="tabular-nums">{r.rank}</span>,
  },
  {
    key: 'nickname',
    header: 'Biệt danh',
    cell: (r) => <span className="block truncate text-fg-1">{r.nickname ?? 'Ẩn danh'}</span>,
  },
  {
    key: 'score',
    header: 'Điểm',
    width: 100,
    align: 'right',
    cell: (r) => <span className="tabular-nums">{formatNumber(r.score)}</span>,
  },
  {
    key: 'correct',
    header: 'Đúng / đã trả lời',
    width: 150,
    align: 'right',
    cell: (r) => (
      <span className="tabular-nums">
        {formatNumber(r.correct)} / {formatNumber(r.answered)}
      </span>
    ),
  },
];

export interface LiveQuizResultsTableProps {
  rows: readonly AdminLiveQuizResultRow[];
}

/**
 * Bảng kết quả bền của phiên đã kết thúc: hạng, biệt danh, điểm, đúng/đã trả lời. KHÔNG có đáp án từng câu của từng người — BE không trả
 * cho admin (admin.md p5-01 §2.2), và id người dùng cũng không hiện.
 */
const LiveQuizResultsTable = memo(function LiveQuizResultsTable({
  rows,
}: LiveQuizResultsTableProps) {
  return (
    <Table
      columns={COLUMNS}
      data={[...rows]}
      emptyMessage="Chưa có kết quả"
      pagination={false}
      rowKey={(r) => r.userId}
    />
  );
});

export default LiveQuizResultsTable;
