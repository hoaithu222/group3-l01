import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import { Badge, EmptyState, Table } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate } from '@/shared/utils/format';

import { MEMBER_ROLE_LABEL } from '../constants/recruiter.constants';
import type { CompanyMemberView } from '../types/company.types';

export interface CompanyMembersTabProps {
  members: readonly CompanyMemberView[];
}

/**
 * Tab "Thành viên" (admin.md p6-08 §2.1): tên, vai trò, ngày tham gia; EMAIL chỉ hiện với người có `user:view` (email nhân sự là dữ liệu cá nhân — thiếu quyền thì
 * cột không tồn tại chứ không chỉ bị che). Tên là liên kết sang hồ sơ người dùng cũng chỉ khi có `user:view`. Đây là NHÂN SỰ của doanh nghiệp, không phải ứng viên.
 */
const CompanyMembersTab = memo(function CompanyMembersTab({ members }: CompanyMembersTabProps) {
  const canViewUser = useAuthStore((s) => s.hasPermission('user', 'view'));

  const columns = useMemo<TableColumn<CompanyMemberView>[]>(() => {
    const cols: TableColumn<CompanyMemberView>[] = [
      {
        key: 'name',
        header: 'Tên',
        width: 180,
        cell: (m) =>
          canViewUser ? (
            <Link
              className="block truncate text-link hover:underline"
              to={`/user/${encodeURIComponent(m.userId)}`}
            >
              {m.name}
            </Link>
          ) : (
            <span className="block truncate">{m.name}</span>
          ),
      },
    ];
    if (canViewUser) {
      cols.push({
        key: 'email',
        header: 'Email',
        width: 220,
        cell: (m) => <span className="block truncate text-fg-2">{m.email || '—'}</span>,
      });
    }
    cols.push(
      {
        key: 'role',
        header: 'Vai trò',
        width: 130,
        cell: (m) => (
          <Badge color={m.role === 'OWNER' ? 'info' : 'neutral'} size="sm" variant="tinted">
            {MEMBER_ROLE_LABEL[m.role]}
          </Badge>
        ),
      },
      {
        key: 'joinedAt',
        header: 'Tham gia',
        width: 110,
        cell: (m) => (
          <span className="tabular-nums text-caption-12 text-fg-3">
            {formatDate(m.joinedAt, 'DD/MM/YYYY')}
          </span>
        ),
      },
    );
    return cols;
  }, [canViewUser]);

  if (members.length === 0) {
    return <EmptyState size="sm" title="Doanh nghiệp chưa có thành viên nào" />;
  }
  return (
    <Table
      columns={columns}
      data={[...members]}
      pagination={false}
      rowKey={(m) => m.userId}
    />
  );
});

export default CompanyMembersTab;
