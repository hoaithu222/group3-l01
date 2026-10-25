import { useState } from 'react';

import { useAuthStore } from '@/app/store';
import { Avatar, Badge, BoxPanel, Button, ConfirmWithReasonModal, Skeleton } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { useDisclosure } from '@/shared/hooks';
import { AuditTrailPanel } from '@/shared/widgets/audit-trail';
import { formatDate, formatNumber, statusBadge } from '@/shared/utils/format';

import { useArchiveWorkspace, useRestoreWorkspace, useWorkspaceStats } from '../service/workspace.queries';
import type { AdminWorkspaceDetail, WorkspaceStatsRange } from '../types/workspace.types';
import AccessSummaryPanel from './AccessSummaryPanel';
import WorkspaceCoverBanner from './WorkspaceCoverBanner';
import WorkspaceImageActions from './WorkspaceImageActions';
import WorkspaceLoadError from './WorkspaceLoadError';
import WorkspaceStatsChart from './WorkspaceStatsChart';

export interface WorkspaceOverviewTabProps {
  detail: AdminWorkspaceDetail;
}

const RANGE_OPTIONS: ReadonlyArray<{ value: WorkspaceStatsRange; label: string }> = [
  { value: '7d', label: '7 ngày' },
  { value: '30d', label: '30 ngày' },
  { value: '90d', label: '90 ngày' },
];

/** Tab "Tổng quan" của `WorkspaceDetailPage` (admin.md p1-01 §2.2). */
export default function WorkspaceOverviewTab({ detail }: WorkspaceOverviewTabProps) {
  const { workspace, stats30d } = detail;
  const canUpdate = useAuthStore((s) => s.hasPermission('workspace', 'update'));
  const [range, setRange] = useState<WorkspaceStatsRange>('30d');

  const {
    data: statsData,
    isLoading: statsLoading,
    isError: statsError,
    error: statsErr,
    refetch: refetchStats,
  } = useWorkspaceStats(workspace.id, range);
  const archiveModal = useDisclosure();
  const restoreModal = useDisclosure();
  const archiveWorkspace = useArchiveWorkspace(workspace.id);
  const restoreWorkspace = useRestoreWorkspace(workspace.id);

  const statusMeta = statusBadge('workspace', workspace.status);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <BoxPanel border="hairline" title="Thông tin nhóm">
        <div className="flex flex-col p-3">
          <WorkspaceCoverBanner workspace={workspace} />
          {/* Avatar đè nhẹ mép dưới bìa (`-mt-6` của khung 64px); vòng màu nền panel tách avatar khỏi ảnh bìa. */}
          <div className="flex flex-wrap items-start gap-3 px-3">
            <Avatar
              className="-mt-6 ring-2 ring-bg-1"
              name={workspace.name}
              size="xl"
              src={workspace.avatarUrl ?? undefined}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1 pt-2">
              <div className="flex items-center gap-2">
                <span className="truncate text-body-16-medium text-fg-1">{workspace.name}</span>
                <Badge color={statusMeta.variant} variant="tinted">
                  {statusMeta.label}
                </Badge>
              </div>
              <span className="text-caption-12 text-fg-3">
                Chủ sở hữu: {workspace.owner?.name ?? '—'} · Tạo lúc {formatDate(workspace.createdAt)}
              </span>
            </div>
            {canUpdate && (
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <WorkspaceImageActions workspace={workspace} />
                {workspace.status === 'ACTIVE' && (
                  <Button size="sm" variant="stroke" onClick={archiveModal.open}>
                    Lưu trữ cấp nền tảng
                  </Button>
                )}
                {workspace.status === 'ARCHIVED' && (
                  <Button size="sm" variant="stroke" onClick={restoreModal.open}>
                    Khôi phục
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </BoxPanel>

      {/* p3-04: chính sách tham gia + khách (chỉ đọc). */}
      <AccessSummaryPanel workspaceId={workspace.id} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <BoxPanel border="hairline" title="Tin nhắn (30 ngày)">
          <div className="flex items-center gap-2 p-3">
            <SystemIcon className="text-sky-6" name="message-bold" size={20} />
            <span className="tabular-nums text-body-16-medium text-fg-1">{formatNumber(stats30d.messages)}</span>
          </div>
        </BoxPanel>
        <BoxPanel border="hairline" title="Thành viên hoạt động">
          <div className="flex items-center gap-2 p-3">
            <SystemIcon className="text-success-5" name="users-bold" size={20} />
            <span className="tabular-nums text-body-16-medium text-fg-1">{formatNumber(stats30d.activeMembers)}</span>
          </div>
        </BoxPanel>
        <BoxPanel border="hairline" title="Tệp (30 ngày)">
          <div className="flex items-center gap-2 p-3">
            <SystemIcon className="text-fg-3" name="file-bold" size={20} />
            <span className="tabular-nums text-body-16-medium text-fg-1">{formatNumber(stats30d.files)}</span>
          </div>
        </BoxPanel>
      </div>

      <BoxPanel
        border="hairline"
        className="h-64"
        headerRight={
          <div className="flex gap-1">
            {RANGE_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                size="xs"
                variant={range === opt.value ? 'primary' : 'ghost'}
                onClick={() => setRange(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        }
        title="Tin nhắn & thành viên hoạt động"
      >
        {statsLoading ? (
          <Skeleton className="h-full w-full" />
        ) : statsError && !statsData ? (
          // Lỗi ≠ "chưa có dữ liệu": không vẽ biểu đồ rỗng như thể nhóm chưa có hoạt động nào.
          <div className="p-2">
            <WorkspaceLoadError
              error={statsErr}
              title="Không tải được số liệu hoạt động"
              onRetry={() => void refetchStats()}
            />
          </div>
        ) : (
          <WorkspaceStatsChart data={statsData?.data ?? []} />
        )}
      </BoxPanel>

      <BoxPanel border="hairline" title="Nhật ký quản trị">
        <AuditTrailPanel targetId={workspace.id} targetType="Workspace" />
      </BoxPanel>

      <ConfirmWithReasonModal
        confirmLabel="Lưu trữ"
        impact="Ngừng gửi tin, lời mời, cuộc gọi; chủ nhóm được thông báo; chỉ quản trị nền tảng khôi phục được."
        open={archiveModal.isOpen}
        title={`Lưu trữ cấp nền tảng — ${workspace.name}`}
        onConfirm={async (reason) => {
          await archiveWorkspace.mutateAsync(reason);
        }}
        onOpenChange={(next) => !next && archiveModal.close()}
      />
      <ConfirmWithReasonModal
        confirmLabel="Khôi phục"
        impact="Không mở lại cuộc gọi, lời mời cũ."
        open={restoreModal.isOpen}
        title={`Khôi phục — ${workspace.name}`}
        onConfirm={async (reason) => {
          await restoreWorkspace.mutateAsync(reason);
        }}
        onOpenChange={(next) => !next && restoreModal.close()}
      />
    </div>
  );
}
