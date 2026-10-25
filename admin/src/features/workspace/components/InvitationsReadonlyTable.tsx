import { memo, useMemo } from 'react';

import { Badge, BoxPanel, Table } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { useQueryParams } from '@/shared/hooks';
import { formatDate, statusBadge } from '@/shared/utils/format';

import {
  INVITATION_PAGE_PARAM,
  INVITATION_PAGE_SIZE,
  INVITATION_PAGE_SIZE_PARAM,
} from '../constants/workspace-access.constants';
import { useWorkspaceInvitations } from '../service/workspace-access.queries';
import type { AdminInvitationRow } from '../types/workspace-access.types';
import { maskEmail } from '../utils/workspace-access.utils';
import { shortId } from '../utils/short-id.utils';
import WorkspaceLoadError from './WorkspaceLoadError';

const COLUMNS: TableColumn<AdminInvitationRow>[] = [
  {
    key: 'email',
    header: 'Email',
    cell: (row) => <span className="truncate text-fg-1">{maskEmail(row.email)}</span>,
  },
  {
    key: 'role',
    header: 'Vai trò',
    width: 120,
    cell: (row) => {
      const meta = statusBadge('workspaceRole', row.role);
      return (
        <Badge color={meta.variant} variant="tinted">
          {meta.label}
        </Badge>
      );
    },
  },
  {
    key: 'invitedBy',
    header: 'Người mời',
    width: 110,
    cell: (row) =>
      typeof row.invitedBy === 'string' ? (
        <span className="text-fg-3">{shortId(row.invitedBy)}</span>
      ) : (
        <span className="text-fg-4">—</span>
      ),
  },
  {
    key: 'status',
    header: 'Trạng thái',
    width: 130,
    cell: (row) => {
      const meta = statusBadge('invitation', row.status);
      return (
        <Badge color={meta.variant} variant="tinted">
          {meta.label}
        </Badge>
      );
    },
  },
  {
    key: 'expiresAt',
    header: 'Hết hạn',
    align: 'right',
    width: 140,
    cell: (row) => (
      <span className="tabular-nums text-caption-12 text-fg-3">
        {formatDate(row.expiresAt, 'HH:mm DD/MM/YYYY')}
      </span>
    ),
  },
];

const rowKey = (row: AdminInvitationRow) => row.id;

export interface InvitationsReadonlyTableProps {
  workspaceId: string;
}

/**
 * Bảng "Lời mời email" CHỈ ĐỌC (p3-04 admin.md §2): email che (`l***@gmail.com`), vai trò, người mời,
 * trạng thái, hết hạn — KHÔNG có token, không nút mời/thu hồi (xử lý khiếu nại, không thay chủ nhóm).
 * Phân trang trên URL bằng khoá riêng (`invPage`/`invSize`) để không đụng bảng thành viên cùng tab.
 */
const InvitationsReadonlyTable = memo(function InvitationsReadonlyTable({
  workspaceId,
}: InvitationsReadonlyTableProps) {
  const qp = useQueryParams({
    pageKey: INVITATION_PAGE_PARAM,
    pageSizeKey: INVITATION_PAGE_SIZE_PARAM,
    defaultPageSize: INVITATION_PAGE_SIZE,
  });
  const params = useMemo(() => ({ page: qp.page, limit: qp.pageSize }), [qp.page, qp.pageSize]);
  const { data, isLoading, isError, error, refetch } = useWorkspaceInvitations(workspaceId, params);

  return (
    <BoxPanel border="hairline" className="h-auto" title="Lời mời email">
      {isError ? (
        <div className="p-2">
          <WorkspaceLoadError
            error={error}
            title="Không tải được danh sách lời mời"
            onRetry={() => void refetch()}
          />
        </div>
      ) : (
        <Table
          columns={COLUMNS}
          currentPage={qp.page}
          data={data?.data ?? []}
          emptyMessage="Nhóm chưa có lời mời email nào"
          loading={isLoading}
          pageSize={qp.pageSize}
          pagination
          rowKey={rowKey}
          total={data?.meta?.total ?? 0}
          onPageChange={qp.setPage}
          onPageSizeChange={qp.setPageSize}
        />
      )}
    </BoxPanel>
  );
});

export default InvitationsReadonlyTable;
