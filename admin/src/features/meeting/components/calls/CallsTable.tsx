import { memo, useCallback, useMemo } from 'react';

import { EmptyState, Table } from '@/shared/ui';
import type { TableSortDir } from '@/shared/ui';

import { MEETING_PAGE_SIZE_OPTIONS } from '../../constants/meeting.constants';
import type { AdminCallRow } from '../../types/call.types';
import { buildCallColumns } from './calls-table.columns';

export interface CallsTableProps {
  rows: readonly AdminCallRow[];
  loading?: boolean;
  /** Đang lọc — đổi chữ trạng thái rỗng cho đúng ("không khớp" thay vì "chưa có cuộc gọi"). */
  filtered: boolean;
  canForceEnd: boolean;
  currentPage: number;
  pageSize: number;
  total: number;
  sortKey: string;
  sortDir: TableSortDir;
  hrefFor: (row: AdminCallRow) => string;
  onSortChange: (key: string | null, dir: TableSortDir | null) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onOpen: (row: AdminCallRow) => void;
  onForceEnd: (row: AdminCallRow) => void;
}

/**
 * Bảng cuộc gọi toàn nền tảng (admin.md p2-07 §2.3) — phân trang + sắp xếp phía SERVER. Bấm dòng mở ngăn kéo chi tiết; cột do `buildCallColumns` khai.
 */
const CallsTable = memo(function CallsTable({
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
}: CallsTableProps) {
  const columns = useMemo(
    () => buildCallColumns({ hrefFor, onOpen, canForceEnd, onForceEnd }),
    [hrefFor, onOpen, canForceEnd, onForceEnd],
  );
  const rowKey = useCallback((row: AdminCallRow) => row.id, []);

  return (
    <Table
      columns={columns}
      currentPage={currentPage}
      data={[...rows]}
      emptyMessage={
        <EmptyState
          icon="phone-bold"
          size="sm"
          title={filtered ? 'Chưa có cuộc gọi phù hợp bộ lọc' : 'Chưa có cuộc gọi nào'}
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

export default CallsTable;
