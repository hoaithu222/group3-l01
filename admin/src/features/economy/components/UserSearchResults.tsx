import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';

import { useUserList, type AdminUser } from '@/features/user';
import { useNavHref } from '@/shared/hooks';
import { Table } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';

import { USER_SEARCH_LIMIT } from '../constants/economy.constants';
import EconomyLoadError from './EconomyLoadError';

export interface UserSearchResultsProps {
  /** Từ khoá đã debounce, ≥ 2 ký tự — nơi dùng chỉ dựng component này khi đủ điều kiện (truy vấn bắt đầu lúc mount). */
  q: string;
}

/**
 * Kết quả tìm người dùng để mở ví: gọi danh sách người dùng có sẵn (`GET /users?q=`, cần `user:view` — nơi dùng đã kiểm quyền), mỗi dòng là liên kết THẬT
 * sang `?userId=` (mở tab mới được). Chỉ hiện vài kết quả đầu; muốn thu hẹp thì gõ thêm.
 */
const UserSearchResults = memo(function UserSearchResults({ q }: UserSearchResultsProps) {
  const buildHref = useNavHref();
  const { data, error, isLoading, refetch } = useUserList({ q, page: 1, limit: USER_SEARCH_LIMIT });

  const columns = useMemo<TableColumn<AdminUser>[]>(
    () => [
      {
        key: 'user',
        header: 'Người dùng',
        cell: (u) => (
          <div className="min-w-0">
            <div className="truncate text-body-14 text-fg-1">{u.name}</div>
            <div className="truncate text-caption-12 text-fg-4">{u.email}</div>
          </div>
        ),
      },
      {
        key: 'wallet',
        header: '',
        width: 110,
        cell: (u) => (
          <Link
            aria-label={`Xem ví của ${u.name}`}
            className="text-link hover:underline"
            to={buildHref({ userId: u.id, search: null })}
          >
            Xem ví
          </Link>
        ),
      },
    ],
    [buildHref],
  );

  if (error && !data) {
    return (
      <EconomyLoadError
        error={error}
        title="Không tải được danh sách người dùng"
        onRetry={() => void refetch()}
      />
    );
  }
  return (
    <Table
      columns={columns}
      data={data?.data ?? []}
      emptyMessage="Không có người dùng nào khớp"
      loading={isLoading}
      pagination={false}
      rowKey={(u) => u.id}
    />
  );
});

export default UserSearchResults;
