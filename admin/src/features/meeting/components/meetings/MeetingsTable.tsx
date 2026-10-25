import { memo, useCallback, useMemo } from 'react';

import { EmptyState, Table } from '@/shared/ui';
import type { TableSortDir } from '@/shared/ui';

import { MEETING_PAGE_SIZE_OPTIONS } from '../../constants/meeting.constants';
import type { AdminMeetingRow } from '../../types/meeting.types';
import { buildMeetingColumns } from './meetings-table.columns';

export interface MeetingsTableProps {
  rows: readonly AdminMeetingRow[];
  loading?: boolean;
  /** Đang lọc — đổi chữ trạng thái rỗng cho đúng ("không khớp" thay vì "chưa có cuộc họp"). */
  filtered: boolean;
  canForceEnd: boolean;
  currentPage: number;
  pageSize: number;
  total: number;
  sortKey: string;
  sortDir: TableSortDir;
  hrefFor: (row: AdminMeetingRow) => string;
  onSortChange: (key: string | null, dir: TableSortDir | null) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onOpen: (row: AdminMeetingRow) => void;
  onForceEnd: (row: AdminMeetingRow) => void;
}

/**
 * Bảng cuộc họp toàn nền tảng (admin.md p2-07 §2.2) — phân trang + sắp xếp phía SERVER (`Table` chỉ vẽ mũi tên header và bắn `onSortChange`).
 * Bấm dòng mở ngăn kéo chi tiết. Cột do `buildMeetingColumns` khai.
 */
const MeetingsTable = memo(function MeetingsTable({
  rows,
  loading,
  filtered,
  canForceEnd,
  currentPage,
  pageSize,
  total,
  sortKey,
  sortDir,
  hrefFor,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  onOpen,
  onForceEnd,
}: MeetingsTableProps) {
  const columns = useMemo(
    () => buildMeetingColumns({ hrefFor, onOpen, canForceEnd, onForceEnd }),
    [hrefFor, onOpen, canForceEnd, onForceEnd],
  );
  const rowKey = useCallback((row: AdminMeetingRow) => row.id, []);

  return (
    <Table
      columns={columns}
      currentPage={currentPage}
      data={[...rows]}
      emptyMessage={
        <EmptyState
          icon="calendar-bold"
          size="sm"
          title={filtered ? 'Chưa có cuộc họp phù hợp bộ lọc' : 'Chưa có cuộc họp nào'}
        />
      }
      loading={loading}
      pageSize={pageSize}
      pageSizeOptions={MEETING_PAGE_SIZE_OPTIONS}
      rowKey={rowKey}
      sortDir={sortDir}
      sortKey={sortKey}
      total={total}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      onRowClick={onOpen}
      onSortChange={onSortChange}
    />
  );
});

export default MeetingsTable;
