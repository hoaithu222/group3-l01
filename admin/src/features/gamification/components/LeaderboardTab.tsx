import { memo, useMemo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import { Button, Callout, EmptyState, SegmentToggle, Table, Text } from '@/shared/ui';
import { WorkspacePicker } from '@/shared/widgets/workspace-picker';
import type { WorkspaceOption } from '@/shared/widgets/workspace-picker';

import { useAdminLeaderboard } from '../service/gamification.queries';
import type { LeaderboardPeriod } from '../types/gamification.types';
import { buildLeaderboardColumns } from './leaderboard-table.columns';

const PERIOD_OPTIONS = [
  { key: 'WEEK', label: 'Tuần' },
  { key: 'MONTH', label: 'Tháng' },
  { key: 'ALL', label: 'Tất cả' },
];

/**
 * Tab "Xếp hạng" (admin.md p4-03 §2.4) — chỉ đọc `GET /admin/gamification/leaderboard`. BE đã lọc người tắt bảng xếp hạng (lọc lúc đọc,
 * có hiệu lực ngay); client vẫn bỏ dòng có `hidden` phòng lỗi BE. Chọn workspace bằng `WorkspacePicker` (tìm phía server + tải thêm, cần
 * `workspace:view`); tên người dùng là liên kết sang `/user/:id` khi có `user:view`.
 */
const LeaderboardTab = memo(function LeaderboardTab() {
  const canViewWorkspace = useAuthStore((s) => s.hasPermission('workspace', 'view'));
  const canViewUser = useAuthStore((s) => s.hasPermission('user', 'view'));
  const [workspace, setWorkspace] = useState<WorkspaceOption | null>(null);
  const [period, setPeriod] = useState<LeaderboardPeriod>('WEEK');

  const params = useMemo(() => (workspace ? { workspaceId: workspace.id, period } : null), [period, workspace]);
  const { data, isFetching, isError, refetch } = useAdminLeaderboard(params);
  const columns = useMemo(() => buildLeaderboardColumns(canViewUser), [canViewUser]);
  const entries = useMemo(() => (data?.entries ?? []).filter((e) => e.hidden !== true), [data]);

  if (!canViewWorkspace) {
    return <Callout description="Cần quyền xem workspace để chọn nhóm xem bảng xếp hạng." />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <WorkspacePicker value={workspace} onChange={setWorkspace} />
        <SegmentToggle
          aria-label="Kỳ xếp hạng"
          options={PERIOD_OPTIONS}
          value={period}
          onValueChange={(v) => setPeriod(v as LeaderboardPeriod)}
        />
      </div>
      {!params ? (
        <EmptyState size="sm" title="Chọn một workspace để xem bảng xếp hạng" />
      ) : isError && !data ? (
        <Callout
          action={
            <Button size="sm" variant="stroke" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
          description="Kiểm tra kết nối rồi thử lại."
          intent="error"
          title="Không tải được bảng xếp hạng"
        />
      ) : (
        <>
          <Table
            columns={columns}
            data={entries}
            emptyMessage="Chưa có ai trên bảng xếp hạng của kỳ này"
            loading={isFetching && !data}
            pagination={false}
            rowKey={(r) => r.userId}
          />
          <Text size="small" skin="muted">
            Không hiển thị người dùng đã tắt bảng xếp hạng.
          </Text>
        </>
      )}
    </div>
  );
});

export default LeaderboardTab;
