import { memo, useMemo } from 'react';

import { BoxPanel, Callout, Dropdown, SummaryCard, Toolbar } from '@/shared/ui';
import { useQueryParams } from '@/shared/hooks';

import WorkspaceConversationTable from '../WorkspaceConversationTable';
import WorkspaceLoadError from '../WorkspaceLoadError';
import { NO_DATA } from '../../constants/workspace.constants';
import { CONVERSATION_STATUS_FILTER_OPTIONS } from '../../constants/workspace-conversations.constants';
import { useAdminWorkspaceConversations } from '../../service/workspace-conversations.queries';
import type {
  AdminConversationListParams,
  ConversationStatusValue,
} from '../../types/workspace-conversations.types';

const STATUS_FILTER_OPTIONS = [{ value: 'all', label: 'Mọi trạng thái' }, ...CONVERSATION_STATUS_FILTER_OPTIONS];

export interface WorkspaceConversationsTabProps {
  workspaceId: string;
}

/**
 * Tab "Nhóm chat" của `WorkspaceDetailPage` (admin.md p1-05 §2.1) — CHỈ đọc,
 * không có hành động nào (giải tán nhóm thuộc module `moderation`, p1-08,
 * admin.md §2.2 — KHÔNG dựng ở đây, xem admin.md dòng 33 "trong module
 * moderation, p1-08"). Bấm hàng không làm gì — không có drawer/detail, cố ý
 * KHÔNG truyền `onRowClick` cho `WorkspaceConversationTable`.
 *
 * Khác `WorkspaceChannelsTab` (p1-03): BE ở đây hỗ trợ lọc `status` VÀ phân
 * trang server thật (`adminListConversationsQuerySchema` nhận `page`/`limit`/
 * `status`, `admin-conversations.controller.ts`) — nên gọi thẳng theo
 * `qp.page`/`qp.pageSize`/`statusFilter`, KHÔNG cần lối "fetch 1 batch lớn rồi
 * lọc/phân trang client" mà p1-03 phải dùng vì BE kênh không hỗ trợ lọc/trang
 * server.
 */
const WorkspaceConversationsTab = memo(function WorkspaceConversationsTab({
  workspaceId,
}: WorkspaceConversationsTabProps) {
  const qp = useQueryParams({ defaultPageSize: 20 });
  const statusFilter = qp.getParam('status', 'all');

  const params = useMemo<AdminConversationListParams>(
    () => ({
      page: qp.page,
      limit: qp.pageSize,
      status: statusFilter !== 'all' ? (statusFilter as ConversationStatusValue) : undefined,
    }),
    [qp.page, qp.pageSize, statusFilter],
  );

  const { data, isLoading, isError, error, refetch } = useAdminWorkspaceConversations(
    workspaceId,
    params,
  );
  const result = data?.data;
  const stats = result?.stats;

  return (
    <div className="flex flex-col gap-3">
      <Callout
        description="Vì quyền riêng tư, trang quản trị không hiển thị tên nhóm, thành viên hay nội dung trò chuyện. Nội dung bị báo cáo được xem trong mục Kiểm duyệt."
        icon="lock-bold"
        intent="info"
        variant="ghost"
      />

      {/* Chưa có số (đang tải / lỗi) → "—", không nói dối 0. Bốn thẻ là một bộ đọc cùng nhau: hẹp thì gãy 2×2, không rớt 3+1. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          color="blue"
          icon="users-group-bold"
          label="Nhóm chat"
          value={stats ? stats.groups : NO_DATA}
        />
        <SummaryCard
          color="green"
          icon="bolt-bold"
          label="Nhóm hoạt động 7 ngày"
          value={stats ? stats.activeGroups7d : NO_DATA}
        />
        <SummaryCard
          color="gray"
          icon="right-left-bold"
          label="Số cặp nhắn 1-1 có thành viên workspace"
          value={stats ? stats.dmPairs : NO_DATA}
        />
        {/* Tổng hợp TOÀN workspace, KHÔNG phân theo nhóm — admin.md p1-05 §2.1. */}
        <SummaryCard
          color="yellow"
          icon="message-bold"
          label="Tin nhắn nhóm 7 ngày"
          value={stats ? stats.messages7d : NO_DATA}
        />
      </div>

      <Toolbar
        left={
          <Dropdown
            aria-label="Lọc theo trạng thái"
            className="w-44"
            options={STATUS_FILTER_OPTIONS}
            size="sm"
            value={statusFilter}
            onValueChange={(v) => qp.setParam('status', v === 'all' ? null : v)}
          />
        }
      />

      <BoxPanel border="hairline" title="Danh sách nhóm chat">
        {/* Lỗi mà chưa có dữ liệu: đừng vẽ bảng trống — "Chưa có nhóm chat" là nói dối khi BE đang lỗi. */}
        {isError && !data ? (
          <div className="p-2">
            <WorkspaceLoadError
              error={error}
              title="Không tải được danh sách nhóm chat"
              onRetry={() => void refetch()}
            />
          </div>
        ) : (
          <WorkspaceConversationTable
            currentPage={qp.page}
            loading={isLoading}
            pageSize={qp.pageSize}
            rows={result?.data ?? []}
            total={result?.meta.total ?? 0}
            onPageChange={qp.setPage}
            onPageSizeChange={qp.setPageSize}
          />
        )}
      </BoxPanel>
    </div>
  );
});

export default WorkspaceConversationsTab;
