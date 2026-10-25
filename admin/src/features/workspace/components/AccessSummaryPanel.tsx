import { memo, type ReactNode } from 'react';

import { Badge, BoxPanel, Skeleton } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import { GUEST_EXPIRING_SOON_HOURS, JOIN_POLICY_LABELS } from '../constants/workspace-access.constants';
import { useWorkspaceAccessSummary } from '../service/workspace-access.queries';
import WorkspaceLoadError from './WorkspaceLoadError';

interface AccessRowProps {
  label: string;
  children: ReactNode;
}

/** Hàng "nhãn · giá trị" — nhãn bề rộng cố định để cột thẳng hàng. */
const AccessRow = memo(function AccessRow({ label, children }: AccessRowProps) {
  return (
    <div className="flex items-start gap-2 border-b border-divider-1 py-2 last:border-b-0">
      <span className="w-40 shrink-0 text-body-14 text-fg-3">{label}</span>
      <div className="min-w-0 flex-1 break-words text-body-14 text-fg-1">{children}</div>
    </div>
  );
});

export interface AccessSummaryPanelProps {
  workspaceId: string;
}

/**
 * Khối "Truy cập nhóm" của tab Tổng quan (p3-04 admin.md §1): chính sách tham gia (Tự do / Cần duyệt),
 * chính sách khách (Bật, tối đa N khách, ≤ M ngày / Tắt), số khách đang hoạt động và số việc chờ xử lý.
 * CHỈ ĐỌC — quản trị nền tảng không mời/duyệt thay chủ nhóm; chỉ thu hồi được (tab Thành viên).
 */
const AccessSummaryPanel = memo(function AccessSummaryPanel({ workspaceId }: AccessSummaryPanelProps) {
  const { data, isLoading, isError, error, refetch } = useWorkspaceAccessSummary(workspaceId);
  const summary = data?.data;

  return (
    <BoxPanel border="hairline" className="h-auto" title="Truy cập nhóm">
      {isLoading ? (
        <Skeleton className="m-2 h-24" />
      ) : isError || !summary ? (
        <div className="p-2">
          <WorkspaceLoadError
            error={error}
            title="Không tải được thông tin truy cập"
            onRetry={() => void refetch()}
          />
        </div>
      ) : (
        <div className="px-3">
          <AccessRow label="Chính sách tham gia">
            <Badge color={summary.joinPolicy === 'APPROVAL' ? 'warning' : 'neutral'} variant="tinted">
              {JOIN_POLICY_LABELS[summary.joinPolicy]}
            </Badge>
          </AccessRow>
          <AccessRow label="Khách">
            {summary.guestPolicy.enabled
              ? `Bật (tối đa ${formatNumber(summary.guestPolicy.maxGuests)} khách, ≤ ${formatNumber(summary.guestPolicy.maxDays)} ngày)`
              : 'Tắt'}
          </AccessRow>
          <AccessRow label="Khách đang hoạt động">
            <span className="tabular-nums">{formatNumber(summary.guests.active)}</span>
            {summary.guests.expiringIn48h > 0 && (
              <Badge className="ml-2" color="warning" variant="tinted">
                {formatNumber(summary.guests.expiringIn48h)} khách sắp hết hạn trong {GUEST_EXPIRING_SOON_HOURS} giờ
              </Badge>
            )}
          </AccessRow>
          <AccessRow label="Đang chờ xử lý">
            <span className="tabular-nums">
              {formatNumber(summary.pendingRequests)} yêu cầu tham gia ·{' '}
              {formatNumber(summary.pendingInvitations)} lời mời
            </span>
          </AccessRow>
        </div>
      )}
    </BoxPanel>
  );
});

export default AccessSummaryPanel;
