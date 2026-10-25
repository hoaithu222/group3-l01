import { memo, useCallback, useMemo } from 'react';

import { EmptyState, Table } from '@/shared/ui';

import type { AdminConversationRow } from '../types/workspace-conversations.types';
import { buildConversationColumns } from './workspace-conversation-table.columns';

export interface WorkspaceConversationTableProps {
  rows: readonly AdminConversationRow[];
  loading?: boolean;
  currentPage: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

/**
 * Bảng hội thoại NHÓM (admin.md p1-05 §2.1) — phân trang SERVER thật (khác
 * `WorkspaceChannelTable` p1-03 phải tự phân trang client vì BE kênh không hỗ
 * trợ), cột khai ở `workspace-conversation-table.columns.tsx`. Không có
 * `sortKey`/`sortDir`/`onSortChange` — server không nhận query `sort`, luôn trả
 * theo `activityAt desc`; bật sort tương tác chỉ sắp được TRONG trang hiện tại
 * nên gây hiểu lầm, xem docblock cột `lastActivityAt`.
 */
const WorkspaceConversationTable = memo(function WorkspaceConversationTable({
  rows,
  loading,
  currentPage,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: WorkspaceConversationTableProps) {
  const columns = useMemo(() => buildConversationColumns(), []);
  const rowKey = useCallback((row: AdminConversationRow) => row.id, []);

  return (
    <Table
      columns={columns}
      currentPage={currentPage}
      data={[...rows]}
      emptyMessage={<EmptyState icon="users-group-bold" size="sm" title="Workspace chưa có nhóm chat" />}
      loading={loading}
      pageSize={pageSize}
      pageSizeOptions={[20, 50, 100]}
      rowKey={rowKey}
      total={total}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
    />
  );
});

export default WorkspaceConversationTable;
