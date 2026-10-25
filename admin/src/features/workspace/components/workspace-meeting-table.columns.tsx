import { Badge } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatNumber, statusBadge } from '@/shared/utils/format';

import { MEETING_END_REASON_LABELS, MEETING_PLATFORM_LABELS } from '../constants/workspace-meetings.constants';
import type { AdminMeetingRow } from '../types/workspace-meetings.types';
import { formatMeetingTimes } from '../utils/workspace-meetings.utils';

/**
 * Cột bảng cuộc họp của workspace (admin.md p2-04 §2.1) — CHỈ metadata: tiêu đề, chủ trì, thời gian, trạng thái, nền tảng, số người.
 * Không có cột agenda/địa điểm/link/tên người tham dự (BE không trả). Chưa có cột "Ghi hình" (`MeetingRecording` thuộc p2-06).
 */
export function buildMeetingColumns(): TableColumn<AdminMeetingRow>[] {
  return [
    {
      key: 'title',
      header: 'Tiêu đề',
      width: 240,
      cell: (row) => <span className="block truncate text-fg-1">{row.title}</span>,
    },
    {
      key: 'host',
      header: 'Chủ trì',
      width: 160,
      cell: (row) =>
        row.host.name ? (
          <span className="block truncate text-fg-2">{row.host.name}</span>
        ) : (
          <span className="text-fg-4">Không còn tài khoản</span>
        ),
    },
    {
      key: 'time',
      header: 'Bắt đầu – Kết thúc',
      width: 240,
      cell: (row) => {
        const { main, local } = formatMeetingTimes(row);
        return (
          <div className="min-w-0">
            <div className="tabular-nums text-fg-1">{main}</div>
            {local && <div className="text-caption-12 text-fg-3">{local}</div>}
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 170,
      cell: (row) => {
        const meta = statusBadge('meeting', row.status);
        return (
          <div className="flex flex-col items-start gap-0.5">
            <Badge color={meta.variant} variant="tinted">
              {meta.label}
            </Badge>
            {row.status === 'ENDED' && row.endReason && (
              <span className="text-caption-12 text-fg-3">{MEETING_END_REASON_LABELS[row.endReason]}</span>
            )}
          </div>
        );
      },
    },
    {
      key: 'platform',
      header: 'Nền tảng',
      width: 130,
      cell: (row) => <span className="text-fg-3">{MEETING_PLATFORM_LABELS[row.platform]}</span>,
    },
    {
      key: 'attendeeCount',
      header: 'Số người',
      align: 'right',
      width: 100,
      cell: (row) => <span className="tabular-nums text-fg-1">{formatNumber(row.attendeeCount)}</span>,
    },
  ];
}
