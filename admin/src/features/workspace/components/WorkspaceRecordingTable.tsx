import { memo, useCallback, useMemo } from 'react';

import { EmptyState, Table } from '@/shared/ui';
import type { TableSortDir } from '@/shared/ui';

import { RECORDING_PAGE_SIZE_OPTIONS } from '../constants/workspace-recordings.constants';
import type { AdminRecordingRow } from '../types/workspace-recordings.types';
import { buildRecordingColumns } from './workspace-recording-table.columns';

export interface WorkspaceRecordingTableProps {
  rows: readonly AdminRecordingRow[];
  loading?: boolean;
  /** Đang lọc — đổi chữ trạng thái rỗng cho đúng ("không khớp" thay vì "chưa có bản ghi"). */
  filtered: boolean;
  showWorkspace: boolean;
  canDelete: boolean;
  currentPage: number;
  pageSize: number;
  total: number;
  sortKey: string;
  sortDir: TableSortDir;
  onSortChange: (key: string | null, dir: TableSortDir | null) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onRowClick: (row: AdminRecordingRow) => void;
  onDelete: (row: AdminRecordingRow) => void;
}

/**
 * Bảng bản ghi hình (admin.md p2-06 §2.2) — phân trang + sắp xếp phía SERVER (`Table` chỉ vẽ mũi tên header và bắn `onSortChange`).
 * Bấm dòng mở ngăn kéo chi tiết; KHÔNG có hành động phát/tải (D-24). Cột do `buildRecordingColumns` khai.
 */
const WorkspaceRecordingTable = memo(function WorkspaceRecordingTable({
  rows,
  loading,
  filtered,
  showWorkspace,
  canDelete,
  currentPage,
  pageSize,
  total,
  sortKey,
  sortDir,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  onRowClick,
  onDelete,
}: WorkspaceRecordingTableProps) {
  const columns = useMemo(
    () => buildRecordingColumns({ showWorkspace, canDelete, onDelete }),
    [showWorkspace, canDelete, onDelete],
  );
  const rowKey = useCallback((row: AdminRecordingRow) => row.id, []);

  return (
    <Table
      columns={columns}
      currentPage={currentPage}
      data={[...rows]}
      emptyMessage={
        <EmptyState
          icon="camera-bold"
          size="sm"
          title={filtered ? 'Không có bản ghi nào khớp bộ lọc' : 'Chưa có bản ghi hình nào'}
        />
      }
      loading={loading}
      pageSize={pageSize}
      pageSizeOptions={RECORDING_PAGE_SIZE_OPTIONS}
      rowKey={rowKey}
      sortDir={sortDir}
      sortKey={sortKey}
      total={total}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      onRowClick={onRowClick}
      onSortChange={onSortChange}
    />
  );
});

export default WorkspaceRecordingTable;
