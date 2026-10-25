import { memo, useMemo } from 'react';

import { Badge, EmptyState, Table } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate, statusBadge } from '@/shared/utils/format';

import type { AdminMeetingSession } from '../../types/meeting.types';
import { formatCount, formatDurationSec, TIME_FORMAT } from '../../utils/meeting-ops.utils';

const dash = <span className="text-fg-4">—</span>;

export interface MeetingSessionsTableProps {
  sessions: readonly AdminMeetingSession[];
}

/**
 * Các phiên họp của một cuộc họp (mỗi lần bắt đầu phòng là một phiên = một `Call`; BE trả tối đa 20 phiên gần nhất): bắt đầu, kết thúc, thời lượng,
 * số người tối đa cùng lúc, lý do kết thúc. Chỉ số đếm — không danh sách người.
 */
const MeetingSessionsTable = memo(function MeetingSessionsTable({
  sessions,
}: MeetingSessionsTableProps) {
  const columns = useMemo<TableColumn<AdminMeetingSession>[]>(
    () => [
      {
        key: 'startedAt',
        header: 'Bắt đầu',
        width: 140,
        cell: (s) => (
          <span className="tabular-nums text-fg-1">{formatDate(s.startedAt, TIME_FORMAT)}</span>
        ),
      },
      {
        key: 'endedAt',
        header: 'Kết thúc',
        width: 140,
        cell: (s) =>
          s.endedAt ? (
            <span className="tabular-nums text-fg-2">{formatDate(s.endedAt, TIME_FORMAT)}</span>
          ) : (
            dash
          ),
      },
      {
        key: 'durationSec',
        header: 'Thời lượng',
        align: 'right',
        width: 110,
        cell: (s) => (
          <span className="tabular-nums text-fg-2">{formatDurationSec(s.durationSec)}</span>
        ),
      },
      {
        key: 'peakParticipants',
        header: 'Tối đa người',
        align: 'right',
        width: 110,
        cell: (s) => (
          <span className="tabular-nums text-fg-2">{formatCount(s.peakParticipants)}</span>
        ),
      },
      {
        key: 'endReason',
        header: 'Lý do kết thúc',
        width: 160,
        cell: (s) => {
          if (!s.endReason) return dash;
          const meta = statusBadge('callEndReason', s.endReason);
          return (
            <Badge color={meta.variant} variant="tinted">
              {meta.label}
            </Badge>
          );
        },
      },
    ],
    [],
  );

  return (
    <Table
      columns={columns}
      data={[...sessions]}
      emptyMessage={<EmptyState icon="clock-bold" size="sm" title="Chưa có phiên họp nào" />}
      pagination={false}
      rowKey={(s) => s.callId}
    />
  );
});

export default MeetingSessionsTable;
