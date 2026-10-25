import { memo } from 'react';

import { BoxPanel, SummaryCard } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';
import { AuditTrailPanel } from '@/shared/widgets/audit-trail';

import {
  ACCESS_AUDIT_ACTIONS,
  GUEST_EXPIRING_SOON_HOURS,
} from '../constants/workspace-access.constants';
import { useWorkspaceAccessSummary } from '../service/workspace-access.queries';
import InvitationsReadonlyTable from './InvitationsReadonlyTable';
import PendingJoinRequests from './PendingJoinRequests';

export interface WorkspaceAccessSectionProps {
  workspaceId: string;
}

/**
 * Phần "Khách, lời mời, yêu cầu tham gia" của tab Thành viên (p3-04 admin.md §1–§2): ba thẻ số
 * (khách đang hoạt động, lời mời đang chờ, yêu cầu chờ duyệt), bảng lời mời email, danh sách yêu cầu
 * chờ duyệt và nhật ký truy cập của nhóm — TẤT CẢ chỉ đọc. Thu hồi khách dùng nút "Thu hồi" ở bảng thành viên phía trên.
 */
const WorkspaceAccessSection = memo(function WorkspaceAccessSection({
  workspaceId,
}: WorkspaceAccessSectionProps) {
  const { data } = useWorkspaceAccessSummary(workspaceId);
  const summary = data?.data;
  // Chưa có số (đang tải / lỗi) → "—", không nói dối 0.
  const num = (n: number | undefined) => (n === undefined ? '—' : formatNumber(n));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard
          animate={false}
          color="blue"
          description={
            summary && summary.guests.expiringIn48h > 0
              ? `${formatNumber(summary.guests.expiringIn48h)} sắp hết hạn trong ${GUEST_EXPIRING_SOON_HOURS} giờ`
              : undefined
          }
          icon="user-check-bold"
          label="Khách đang hoạt động"
          value={num(summary?.guests.active)}
        />
        <SummaryCard
          animate={false}
          color="gray"
          icon="envelope-bold"
          label="Lời mời đang chờ"
          value={num(summary?.pendingInvitations)}
        />
        <SummaryCard
          animate={false}
          color={summary && summary.pendingRequests > 0 ? 'yellow' : 'gray'}
          icon="user-plus-bold"
          label="Yêu cầu chờ duyệt"
          value={num(summary?.pendingRequests)}
        />
      </div>
      <InvitationsReadonlyTable workspaceId={workspaceId} />
      <PendingJoinRequests workspaceId={workspaceId} />
      <BoxPanel border="hairline" className="h-auto" title="Nhật ký truy cập">
        <div className="p-2">
          <AuditTrailPanel actions={ACCESS_AUDIT_ACTIONS} workspaceId={workspaceId} />
        </div>
      </BoxPanel>
    </div>
  );
});

export default WorkspaceAccessSection;
