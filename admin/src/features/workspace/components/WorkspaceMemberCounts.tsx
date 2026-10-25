import { memo } from 'react';

import { SummaryCard } from '@/shared/ui';

import { NO_DATA } from '../constants/workspace.constants';
import { useWorkspaceAccessSummary } from '../service/workspace-access.queries';

export interface WorkspaceMemberCountsProps {
  workspaceId: string;
}

/**
 * Ba thẻ đếm đầu tab "Thành viên" (admin.md p1-02 §2.1): thành viên ACTIVE, bị chặn và link mời đang hoạt động — cả ba đọc từ
 * `GET /admin/workspaces/:id/access-summary` (`members.{active,banned}`, `inviteLinks.active`; cùng khoá cache với các khối
 * khác nên chỉ MỘT lượt gọi), thay cho hai truy vấn danh sách `limit=1` trước đây. Link mời chỉ là SỐ LƯỢNG: token/đường dẫn
 * mời không bao giờ tới admin (`tests/features/workspace/access-privacy.test.tsx`).
 *
 * Chưa có số (đang tải / tải lỗi) → "—", KHÔNG nói dối `0`: "0 bị chặn" đọc ra như một tin tốt đúng lúc BE lỗi.
 */
const WorkspaceMemberCounts = memo(function WorkspaceMemberCounts({
  workspaceId,
}: WorkspaceMemberCountsProps) {
  const summary = useWorkspaceAccessSummary(workspaceId).data?.data;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <SummaryCard
        color="blue"
        icon="users-bold"
        label="Thành viên ACTIVE"
        value={summary ? summary.members.active : NO_DATA}
      />
      <SummaryCard
        color="red"
        icon="circle-exclamation-bold"
        label="Bị chặn"
        value={summary ? summary.members.banned : NO_DATA}
      />
      <SummaryCard
        color="green"
        icon="link-bold"
        label="Link mời đang hoạt động"
        value={summary ? summary.inviteLinks.active : NO_DATA}
      />
    </div>
  );
});

export default WorkspaceMemberCounts;
