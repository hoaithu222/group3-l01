import { memo, useCallback, useMemo } from 'react';

import { Avatar, Badge, Table } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { formatDate, statusBadge } from '@/shared/utils/format';

import { USER_ROLE_LABEL } from '../constants/user.constants';
import type { AdminUser } from '../types/user.types';

export interface UserTableProps {
  rows: readonly AdminUser[];
  loading?: boolean;
  onRowClick: (row: AdminUser) => void;
  /** Trang hiện tại, 1-based — forward thẳng cho `<Table>` (server-side pagination). */
  currentPage: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

/**
 * Bảng danh sách người dùng — `Table` kit2 tự vẽ footer phân trang (server-side:
 * consumer chỉ truyền trang hiện tại + tổng số dòng, xem `pages/UserListPage.tsx`).
 */
const UserTable = memo(function UserTable({
  rows,
  loading,
  onRowClick,
  currentPage,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: UserTableProps) {
  const columns = useMemo<TableColumn<AdminUser>[]>(
    () => [
      {
        key: 'name',
        header: 'Tên',
        width: 260,
        cell: (row) => (
          <div className="flex min-w-0 items-center gap-2">
            <Avatar name={row.name} size="xs" src={row.avatarUrl ?? undefined} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-fg-1">{row.name}</span>
              <span className="truncate text-caption-12 text-fg-4">{row.email}</span>
            </div>
          </div>
        ),
      },
      {
        key: 'role',
        header: 'Vai trò',
        width: 140,
        cell: (row) => <Badge variant="tinted">{USER_ROLE_LABEL[row.role] ?? row.role}</Badge>,
      },
      {
        key: 'status',
        header: 'Trạng thái',
        width: 132,
        cell: (row) => {
          const meta = statusBadge('user', row.status);
          return (
            <Badge color={meta.variant} variant="tinted">
              {meta.label}
            </Badge>
          );
        },
      },
      {
        key: 'emailVerified',
        header: 'Email xác minh',
        width: 120,
        align: 'center',
        cell: (row) =>
          row.emailVerified ? (
            <SystemIcon className="text-success" name="circle-check-outline" size={16} />
          ) : (
            <SystemIcon className="text-fg-5" name="circle-xmark-outline" size={16} />
          ),
      },
      {
        key: 'createdAt',
        header: 'Tạo lúc',
        align: 'right',
        width: 132,
        cell: (row) => (
          <span className="tabular-nums text-caption-12 text-fg-3">
            {formatDate(row.createdAt)}
          </span>
        ),
      },
    ],
    [],
  );

  const rowKey = useCallback((row: AdminUser) => row.id, []);

  return (
    <Table
      className="min-h-0 flex-1"
      columns={columns}
      currentPage={currentPage}
      data={[...rows]}
      emptyMessage="Không có người dùng nào khớp bộ lọc"
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

export default UserTable;
