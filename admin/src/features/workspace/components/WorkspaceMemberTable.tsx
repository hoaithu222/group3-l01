import { memo, useCallback, useMemo } from 'react';

import { useAuthStore } from '@/app/store';
import { Table } from '@/shared/ui';

import type { AdminMemberRow } from '../types/workspace-members.types';
import { buildMemberColumns } from './workspace-member-table.columns';

export interface WorkspaceMemberTableProps {
  rows: readonly AdminMemberRow[];
  loading?: boolean;
  /** `workspace:update` — hàng OWNER vẫn hiện nút nhưng khoá + `title` giải thích. */
  canRevoke: boolean;
  canViewAuditLog: boolean;
  onRevoke: (row: AdminMemberRow) => void;
  onViewAuditLog: (row: AdminMemberRow) => void;
  currentPage: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

/** Bảng thành viên (admin.md p1-02 §2.1) — cột/hành động khai ở `workspace-member-table.columns.tsx`. */
const WorkspaceMemberTable = memo(function WorkspaceMemberTable({
  rows,
  loading,
  canRevoke,
  canViewAuditLog,
  onRevoke,
  onViewAuditLog,
  currentPage,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: WorkspaceMemberTableProps) {
  const canViewUser = useAuthStore((s) => s.hasPermission('user', 'view'));

  const columns = useMemo(
    () => buildMemberColumns({ canViewUser, canRevoke, canViewAuditLog, onRevoke, onViewAuditLog }),
    [canViewUser, canRevoke, canViewAuditLog, onRevoke, onViewAuditLog],
  );

  const rowKey = useCallback((row: AdminMemberRow) => row.user.id, []);

  return (
    <Table
      columns={columns}
      currentPage={currentPage}
      data={[...rows]}
      emptyMessage="Không có thành viên nào khớp bộ lọc"
      loading={loading}
      pageSize={pageSize}
      rowKey={rowKey}
      total={total}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
    />
  );
});

export default WorkspaceMemberTable;
