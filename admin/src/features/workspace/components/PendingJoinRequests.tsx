import { memo, useMemo } from 'react';

import { BoxPanel, Table } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate } from '@/shared/utils/format';

import { PENDING_REQUESTS_PREVIEW } from '../constants/workspace-access.constants';
import { useAdminWorkspaceMembers } from '../service/workspace-members.queries';
import type { AdminListMembersParams, AdminMemberRow } from '../types/workspace-members.types';
import WorkspaceLoadError from './WorkspaceLoadError';

const COLUMNS: TableColumn<AdminMemberRow>[] = [
  {
    key: 'user',
    header: 'Người xin vào',
    cell: (row) => <span className="truncate text-fg-1">{row.user.name}</span>,
  },
  {
    key: 'requestedAt',
    header: 'Gửi yêu cầu lúc',
    align: 'right',
    width: 160,
    cell: (row) => (
      <span className="tabular-nums text-caption-12 text-fg-3">
        {formatDate(row.requestedAt ?? row.joinedAt, 'HH:mm DD/MM/YYYY')}
      </span>
    ),
  },
];

const rowKey = (row: AdminMemberRow) => row.user.id;

/** Yêu cầu = thành viên `PENDING` — dùng lại route danh sách thành viên (admin.md p3-04 §3). */
const PENDING_PARAMS: AdminListMembersParams = {
  status: 'PENDING',
  sort: 'joinedAt',
  page: 1,
  limit: PENDING_REQUESTS_PREVIEW,
};

export interface PendingJoinRequestsProps {
  workspaceId: string;
}

/**
 * Khối "Yêu cầu chờ duyệt" CHỈ ĐỌC (p3-04 admin.md §2): đếm + danh sách tên, thời gian gửi. Duyệt/từ chối
 * là việc của chủ nhóm — admin nền tảng không thay. Chỉ hiện các yêu cầu mới nhất; xem đủ qua bộ lọc
 * trạng thái "Chờ tham gia" của bảng thành viên.
 */
const PendingJoinRequests = memo(function PendingJoinRequests({
  workspaceId,
}: PendingJoinRequestsProps) {
  const { data, isLoading, isError, error, refetch } = useAdminWorkspaceMembers(
    workspaceId,
    PENDING_PARAMS,
  );
  const rows = useMemo(() => data?.data ?? [], [data]);
  const total = data?.meta?.total ?? rows.length;

  return (
    <BoxPanel
      border="hairline"
      className="h-auto"
      description={
        total > rows.length ? `Hiện ${rows.length}/${total} yêu cầu mới nhất` : undefined
      }
      title={`Yêu cầu chờ duyệt (${total})`}
    >
      {isError ? (
        <div className="p-2">
          <WorkspaceLoadError
            error={error}
            title="Không tải được yêu cầu chờ duyệt"
            onRetry={() => void refetch()}
          />
        </div>
      ) : (
        <Table
          columns={COLUMNS}
          data={rows}
          emptyMessage="Không có yêu cầu nào đang chờ duyệt"
          loading={isLoading}
          pagination={false}
          rowKey={rowKey}
        />
      )}
    </BoxPanel>
  );
});

export default PendingJoinRequests;
