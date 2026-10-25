import { memo, useCallback, useMemo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import { BoxPanel, Callout, ConfirmWithReasonModal, Dropdown, Toolbar } from '@/shared/ui';
import { useDisclosure, useQueryParams, useTableSort } from '@/shared/hooks';

import WorkspaceChannelStats from '../WorkspaceChannelStats';
import WorkspaceChannelTable from '../WorkspaceChannelTable';
import WorkspaceLoadError from '../WorkspaceLoadError';
import { getChannelSortValue } from '../workspace-channel-table.columns';
import {
  CHANNEL_FETCH_LIMIT,
  CHANNEL_STATUS_FILTER_OPTIONS,
  CHANNEL_TYPE_FILTER_OPTIONS,
} from '../../constants/workspace-channels.constants';
import {
  useAdminWorkspaceChannels,
  useArchiveChannel,
  useRestoreChannel,
} from '../../service/workspace-channels.queries';
import type { AdminChannelRow } from '../../types/workspace-channels.types';

const STATUS_FILTER_OPTIONS = [{ value: 'all', label: 'Mọi trạng thái' }, ...CHANNEL_STATUS_FILTER_OPTIONS];
const TYPE_FILTER_OPTIONS = [{ value: 'all', label: 'Mọi loại' }, ...CHANNEL_TYPE_FILTER_OPTIONS];

export interface WorkspaceChannelsTabProps {
  workspaceId: string;
}

/** Tab "Kênh" của `WorkspaceDetailPage` (admin.md p1-03 §2). */
const WorkspaceChannelsTab = memo(function WorkspaceChannelsTab({
  workspaceId,
}: WorkspaceChannelsTabProps) {
  const canModerate = useAuthStore((s) => s.hasPermission('moderation', 'update'));

  const qp = useQueryParams({ defaultPageSize: 20 });
  const statusFilter = qp.getParam('status', 'all');
  const typeFilter = qp.getParam('type', 'all');

  const { data, isLoading, isError, error, refetch } = useAdminWorkspaceChannels(workspaceId, {
    page: 1,
    limit: CHANNEL_FETCH_LIMIT,
  });
  const result = data?.data;
  const publicRows = useMemo(() => result?.public ?? [], [result]);

  const filteredRows = useMemo(
    () =>
      publicRows.filter(
        (row) =>
          (statusFilter === 'all' || row.status === statusFilter) &&
          (typeFilter === 'all' || row.type === typeFilter),
      ),
    [publicRows, statusFilter, typeFilter],
  );

  const { sorted, sortKey, sortDir, onSortChange } = useTableSort(filteredRows, getChannelSortValue);

  const pagedRows = useMemo(
    () => sorted.slice((qp.page - 1) * qp.pageSize, qp.page * qp.pageSize),
    [sorted, qp.page, qp.pageSize],
  );

  const archiveModal = useDisclosure();
  const restoreModal = useDisclosure();
  const archiveChannel = useArchiveChannel(workspaceId);
  const restoreChannel = useRestoreChannel(workspaceId);
  const [archiveTarget, setArchiveTarget] = useState<AdminChannelRow | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<AdminChannelRow | null>(null);

  const handleArchive = useCallback(
    (row: AdminChannelRow) => {
      setArchiveTarget(row);
      archiveModal.open();
    },
    [archiveModal],
  );
  const handleRestore = useCallback(
    (row: AdminChannelRow) => {
      setRestoreTarget(row);
      restoreModal.open();
    },
    [restoreModal],
  );

  return (
    <div className="flex flex-col gap-3">
      <Callout
        description="Quản trị nền tảng không xem tên, thành viên hay nội dung kênh riêng tư."
        icon="lock-bold"
        intent="neutral"
        variant="ghost"
      />

      <WorkspaceChannelStats result={result} workspaceId={workspaceId} />

      <Toolbar
        left={
          <>
            <Dropdown
              aria-label="Lọc theo trạng thái"
              className="w-40"
              options={STATUS_FILTER_OPTIONS}
              size="sm"
              value={statusFilter}
              onValueChange={(v) => qp.setParam('status', v === 'all' ? null : v)}
            />
            <Dropdown
              aria-label="Lọc theo loại kênh"
              className="w-40"
              options={TYPE_FILTER_OPTIONS}
              size="sm"
              value={typeFilter}
              onValueChange={(v) => qp.setParam('type', v === 'all' ? null : v)}
            />
          </>
        }
      />

      <BoxPanel border="hairline" title="Danh sách kênh công khai">
        {/* Lỗi mà chưa có dữ liệu: đừng vẽ bảng trống — "Chưa có kênh nào" là nói dối khi BE đang lỗi. */}
        {isError && !data ? (
          <div className="p-2">
            <WorkspaceLoadError
              error={error}
              title="Không tải được danh sách kênh"
              onRetry={() => void refetch()}
            />
          </div>
        ) : (
          <WorkspaceChannelTable
            canModerate={canModerate}
            currentPage={qp.page}
            loading={isLoading}
            pageSize={qp.pageSize}
            rows={pagedRows}
            sortDir={sortDir}
            sortKey={sortKey}
            total={filteredRows.length}
            onArchive={handleArchive}
            onPageChange={qp.setPage}
            onPageSizeChange={qp.setPageSize}
            onRestore={handleRestore}
            onSortChange={onSortChange}
          />
        )}
      </BoxPanel>

      {archiveTarget && (
        <ConfirmWithReasonModal
          confirmLabel="Lưu trữ"
          impact="Kênh chuyển chỉ đọc cho mọi thành viên; nếu là kênh mặc định sẽ bị từ chối — chủ nhóm cần đổi kênh mặc định trước."
          open={archiveModal.isOpen}
          title={`Lưu trữ vì vi phạm — ${archiveTarget.name}`}
          onConfirm={async (reason) => {
            await archiveChannel.mutateAsync({ channelId: archiveTarget.id, reason });
          }}
          onOpenChange={(next) => !next && archiveModal.close()}
        />
      )}

      {restoreTarget && (
        <ConfirmWithReasonModal
          confirmLabel="Khôi phục"
          impact="Kênh mở lại cho mọi thành viên đăng bài như trước khi lưu trữ."
          open={restoreModal.isOpen}
          title={`Khôi phục — ${restoreTarget.name}`}
          onConfirm={async (reason) => {
            await restoreChannel.mutateAsync({ channelId: restoreTarget.id, reason });
          }}
          onOpenChange={(next) => !next && restoreModal.close()}
        />
      )}
    </div>
  );
});

export default WorkspaceChannelsTab;
