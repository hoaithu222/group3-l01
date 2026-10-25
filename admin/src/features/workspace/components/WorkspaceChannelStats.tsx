import { memo, useMemo } from 'react';

import { Callout, SummaryCard } from '@/shared/ui';

import { NO_DATA } from '../constants/workspace.constants';
import { CHANNEL_FETCH_LIMIT } from '../constants/workspace-channels.constants';
import { useWorkspaceAccessSummary } from '../service/workspace-access.queries';
import type { AdminChannelListResult } from '../types/workspace-channels.types';

export interface WorkspaceChannelStatsProps {
  workspaceId: string;
  /** Kết quả danh sách kênh; `undefined` = đang tải hoặc tải lỗi. */
  result: AdminChannelListResult | undefined;
}

/**
 * Ba thẻ số đầu tab "Kênh" (admin.md p1-03 §2): kênh công khai đang hoạt động, kênh riêng tư (CHỈ số lượng — không
 * đọc tên/nội dung, kèm số có cấp theo vai trò từ p3-04) và kênh đã lưu trữ; cộng cảnh báo khi danh sách công
 * khai vượt `CHANNEL_FETCH_LIMIT`. Chưa có dữ liệu (đang tải / lỗi) → "—": đếm từ danh sách rỗng ra `0` là nói dối.
 */
const WorkspaceChannelStats = memo(function WorkspaceChannelStats({
  workspaceId,
  result,
}: WorkspaceChannelStatsProps) {
  const withRoleGrant =
    useWorkspaceAccessSummary(workspaceId).data?.data.privateChannels.withRoleGrant;
  const publicRows = useMemo(() => result?.public ?? [], [result]);
  const activeCount = useMemo(
    () => publicRows.filter((r) => r.status === 'ACTIVE').length,
    [publicRows],
  );
  const archivedCount = useMemo(
    () =>
      publicRows.filter((r) => r.status === 'ARCHIVED').length +
      (result?.privateArchivedCount ?? 0),
    [publicRows, result],
  );

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard
          color="blue"
          icon="hashtag-bold"
          label="Kênh công khai đang hoạt động"
          value={result ? activeCount : NO_DATA}
        />
        <SummaryCard
          color="gray"
          description={
            withRoleGrant === undefined
              ? undefined
              : `trong đó ${withRoleGrant} kênh có cấp theo vai trò`
          }
          icon="lock-bold"
          label="Kênh riêng tư"
          value={result ? result.privateCount : NO_DATA}
        />
        <SummaryCard
          color="gray"
          icon="boxes-stacked-bold"
          label="Kênh đã lưu trữ"
          value={result ? archivedCount : NO_DATA}
        />
      </div>

      {result && result.meta.total > CHANNEL_FETCH_LIMIT && (
        <Callout
          description={`Chỉ hiện ${CHANNEL_FETCH_LIMIT}/${result.meta.total} kênh công khai đầu (mới nhất theo vị trí sắp xếp) — lọc/sắp xếp phía dưới chỉ áp dụng trong tập này.`}
          intent="warning"
          variant="ghost"
        />
      )}
    </>
  );
});

export default WorkspaceChannelStats;
