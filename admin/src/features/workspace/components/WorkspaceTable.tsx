import { memo, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import { Avatar, Badge, Table } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate, formatNumber, statusBadge } from '@/shared/utils/format';

import type { AdminWorkspaceRow } from '../types/workspace.types';

/**
 * `/user` viết cứng CÓ CHỦ ĐÍCH — KHÔNG import `MODULE_PATHS` từ
 * `module-registry.ts`: file này nằm trên nhánh `page.lazy` của
 * `workspaceModule` (chính registry lazy-load nó), import ngược lại registry
 * tạo vòng (`npm run check:cycles`), cùng lý do đã ghi ở `UserDetailPage.tsx`.
 */
const USER_MODULE_PATH = '/user';

export interface WorkspaceTableProps {
  rows: readonly AdminWorkspaceRow[];
  loading?: boolean;
  onRowClick: (row: AdminWorkspaceRow) => void;
  currentPage: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

/** Bảng danh bạ workspace (admin.md p1-01 §2.1) — `Table` kit2 tự vẽ footer phân trang server-side. */
const WorkspaceTable = memo(function WorkspaceTable({
  rows,
  loading,
  onRowClick,
  currentPage,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: WorkspaceTableProps) {
  const canViewUser = useAuthStore((s) => s.hasPermission('user', 'view'));

  const columns = useMemo<TableColumn<AdminWorkspaceRow>[]>(
    () => [
      {
        key: 'name',
        header: 'Tên',
        width: 240,
        cell: (row) => (
          <div className="flex min-w-0 items-center gap-2">
            <Avatar name={row.name} size="xs" src={row.avatarUrl ?? undefined} />
            <span className="truncate text-fg-1">{row.name}</span>
          </div>
        ),
      },
      {
        key: 'owner',
        header: 'Chủ sở hữu',
        width: 180,
        cell: (row) =>
          row.owner ? (
            canViewUser ? (
              <Link
                className="truncate text-link hover:underline"
                to={`${USER_MODULE_PATH}?id=${row.owner.id}`}
              >
                {row.owner.name}
              </Link>
            ) : (
              <span className="truncate text-fg-2">{row.owner.name}</span>
            )
          ) : (
            <span className="text-fg-4">—</span>
          ),
      },
      {
        key: 'memberCount',
        header: 'Thành viên',
        width: 110,
        align: 'right',
        cell: (row) => (
          <span className="tabular-nums text-fg-2">{formatNumber(row.memberCount)}</span>
        ),
      },
      {
        key: 'status',
        header: 'Trạng thái',
        width: 132,
        cell: (row) => {
          const meta = statusBadge('workspace', row.status);
          return (
            <Badge color={meta.variant} variant="tinted">
              {meta.label}
            </Badge>
          );
        },
      },
      {
        key: 'lastActivityAt',
        header: 'Hoạt động gần nhất',
        align: 'right',
        width: 160,
        cell: (row) => (
          <span className="tabular-nums text-caption-12 text-fg-3">
            {formatDate(row.lastActivityAt)}
          </span>
        ),
      },
    ],
    [canViewUser],
  );

  const rowKey = useCallback((row: AdminWorkspaceRow) => row.id, []);

  return (
    <Table
      className="min-h-0 flex-1"
      columns={columns}
      currentPage={currentPage}
      data={[...rows]}
      emptyMessage="Chưa có workspace nào"
      fill
      loading={loading}
      pageSize={pageSize}
      rowKey={rowKey}
      total={total}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      onRowClick={onRowClick}
    />
  );
});

export default WorkspaceTable;
