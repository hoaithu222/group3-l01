import { memo, useCallback, useMemo } from 'react';

import { Table } from '@/shared/ui';
import type { TableSortDir } from '@/shared/ui';

import type { AdminChannelRow } from '../types/workspace-channels.types';
import { buildChannelColumns } from './workspace-channel-table.columns';

export interface WorkspaceChannelTableProps {
  rows: readonly AdminChannelRow[];
  loading?: boolean;
  /** `moderation:update` — thiếu quyền thì cột hành động không render nút nào (admin.md p1-03 §4). */
  canModerate: boolean;
  onArchive: (row: AdminChannelRow) => void;
  onRestore: (row: AdminChannelRow) => void;
  currentPage: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  sortKey: string | null;
  sortDir: TableSortDir | null;
  onSortChange: (key: string | null, dir: TableSortDir | null) => void;
}

/** Bảng kênh PUBLIC (admin.md p1-03 §2.1) — cột/hành động khai ở `workspace-channel-table.columns.tsx`. */
const WorkspaceChannelTable = memo(function WorkspaceChannelTable({
  rows,
  loading,
  canModerate,
  onArchive,
  onRestore,
  currentPage,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  sortKey,
  sortDir,
  onSortChange,
}: WorkspaceChannelTableProps) {
  const columns = useMemo(
    () => buildChannelColumns({ canModerate, onArchive, onRestore }),
    [canModerate, onArchive, onRestore],
  );

  const rowKey = useCallback((row: AdminChannelRow) => row.id, []);

  return (
    <Table
      columns={columns}
      currentPage={currentPage}
      data={[...rows]}
      emptyMessage="Không có kênh công khai nào khớp bộ lọc"
      loading={loading}
      pageSize={pageSize}
      rowKey={rowKey}
      sortDir={sortDir}
      sortKey={sortKey}
      total={total}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      onSortChange={onSortChange}
    />
  );
});

export default WorkspaceChannelTable;
