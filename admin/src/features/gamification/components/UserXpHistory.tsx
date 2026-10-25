import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import { Badge, Button, Table, Text } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate } from '@/shared/utils/format';

import type { UserXpEvent, XpSourceType } from '../types/gamification.types';
import { formatXpDelta, xpBlockedReasonLabel, xpSourceMeta } from '../utils/xp-event-format';

/** `/workspace` viết cứng CÓ CHỦ ĐÍCH — không import `MODULE_PATHS` (khép vòng `check:cycles`, xem `leaderboard-table.columns.tsx`). */
const WORKSPACE_MODULE_PATH = '/workspace';

const sourceLabel = (s: XpSourceType): string =>
  s === 'ADMIN_ADJUST' ? 'Điều chỉnh thủ công' : xpSourceMeta(s).label;

/** Không có tên (nhóm đã xoá) → 6 ký tự cuối của id để vẫn đối chiếu được. */
const shortId = (id: string): string => id.slice(-6);

export interface UserXpHistoryProps {
  events: UserXpEvent[];
  /** Có trang trước (đã đi qua ít nhất một cursor). */
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * Lịch sử XP của một người (admin.md p4-03 §2.5): nguồn, XP, ghi chú ("Chạm trần"/"Bị chặn: …"), workspace, thời điểm; phân trang cursor.
 * Cột Workspace: tên nhóm là liên kết sang `/workspace/:id` khi có `workspace:view`; sự kiện không thuộc nhóm nào (vd điều chỉnh thủ công) → "—".
 */
const UserXpHistory = memo(function UserXpHistory({ events, hasPrev, hasNext, onPrev, onNext }: UserXpHistoryProps) {
  const canViewWorkspace = useAuthStore((s) => s.hasPermission('workspace', 'view'));

  const columns = useMemo<TableColumn<UserXpEvent>[]>(
    () => [
      { key: 'source', header: 'Nguồn', cell: (row) => sourceLabel(row.sourceType) },
      {
        key: 'xp',
        header: 'XP',
        align: 'right',
        cell: (row) => <span className="tabular-nums">{formatXpDelta(row.xp)}</span>,
      },
      {
        key: 'note',
        header: 'Ghi chú',
        cell: (row) =>
          row.blockedReason ? (
            <Badge color="error" variant="tinted">
              Bị chặn: {xpBlockedReasonLabel(row.blockedReason)}
            </Badge>
          ) : row.capped ? (
            <Badge color="warning" variant="tinted">
              Chạm trần
            </Badge>
          ) : null,
      },
      {
        key: 'workspace',
        header: 'Workspace',
        cell: (row) => {
          if (!row.workspaceId) return <span className="text-fg-4">—</span>;
          const label = row.workspaceName ?? `Nhóm …${shortId(row.workspaceId)}`;
          return canViewWorkspace && row.workspaceName ? (
            <Link
              className="truncate text-link hover:underline"
              to={`${WORKSPACE_MODULE_PATH}/${encodeURIComponent(row.workspaceId)}`}
            >
              {label}
            </Link>
          ) : (
            <span className="truncate text-fg-2">{label}</span>
          );
        },
      },
      { key: 'occurredAt', header: 'Thời điểm', cell: (row) => formatDate(row.occurredAt, 'HH:mm DD/MM/YYYY') },
    ],
    [canViewWorkspace],
  );

  return (
    <section className="flex flex-col gap-2">
      <Text weight="bold">Lịch sử XP</Text>
      <Table
        columns={columns}
        data={events}
        emptyMessage="Chưa có sự kiện XP nào"
        pagination={false}
        rowKey={(row) => row.id}
      />
      <div className="flex justify-end gap-2">
        {hasPrev && (
          <Button size="sm" variant="ghost" onClick={onPrev}>
            Trang trước
          </Button>
        )}
        {hasNext && (
          <Button size="sm" variant="stroke" onClick={onNext}>
            Trang sau
          </Button>
        )}
      </div>
    </section>
  );
});

export default UserXpHistory;
