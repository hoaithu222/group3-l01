import { memo, useCallback, useMemo } from 'react';

import { EmptyState, Table } from '@/shared/ui';

import type { AdminMeetingRow } from '../types/workspace-meetings.types';
import { buildMeetingColumns } from './workspace-meeting-table.columns';

export interface WorkspaceMeetingTableProps {
  rows: readonly AdminMeetingRow[];
  loading?: boolean;
  /** Đang lọc (trạng thái/ngày) — đổi chữ trạng thái rỗng cho đúng ("không khớp" thay vì "chưa có cuộc họp"). */
  filtered: boolean;
  currentPage: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

/**
 * Bảng cuộc họp của workspace (admin.md p2-04 §2.1) — phân trang SERVER (`startAt` mới → cũ, không có sắp xếp tương tác: server không nhận
 * `sort`, sắp trong một trang sẽ gây hiểu lầm — cùng lý do `WorkspaceConversationTable`). Không có hành động, không mở chi tiết (force-end ở p2-07).
 */
const WorkspaceMeetingTable = memo(function WorkspaceMeetingTable({
  rows,
  loading,
  filtered,
  currentPage,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: WorkspaceMeetingTableProps) {
  const columns = useMemo(() => buildMeetingColumns(), []);
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
          title={filtered ? 'Không có cuộc họp nào khớp bộ lọc' : 'Workspace chưa có cuộc họp'}
        />
      }
      loading={loading}
      pageSize={pageSize}
      pageSizeOptions={[20, 50]}
      rowKey={rowKey}
      total={total}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
    />
  );
});

export default WorkspaceMeetingTable;
