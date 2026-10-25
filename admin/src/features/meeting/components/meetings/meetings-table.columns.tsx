import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';

import { Badge, Button, Tooltip } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { isModifiedClick } from '@/shared/utils/browser/link.utils';
import { statusBadge } from '@/shared/utils/format';

import {
  MEETING_END_REASON_LABELS,
  MEETING_PLATFORM_LABELS,
} from '../../constants/meeting.constants';
import type { AdminMeetingRow } from '../../types/meeting.types';
import {
  canForceEndMeeting,
  formatCount,
  formatDurationSec,
  formatMeetingTimes,
  meetingOpsPath,
} from '../../utils/meeting-ops.utils';

const dash = <span className="text-fg-4">—</span>;
/** Bấm nút trong dòng không được kéo theo `onRowClick` (mở ngăn kéo chi tiết). */
const stop = (e: MouseEvent) => e.stopPropagation();

export interface MeetingColumnOptions {
  /** URL THẬT mở ngăn kéo cuộc họp (giữ bộ lọc) — Ctrl+click mở tab mới được. */
  hrefFor: (row: AdminMeetingRow) => string;
  onOpen: (row: AdminMeetingRow) => void;
  /** Có `meeting:update` — thiếu thì KHÔNG có nút "Kết thúc". */
  canForceEnd: boolean;
  onForceEnd: (row: AdminMeetingRow) => void;
}

/**
 * Cột bảng cuộc họp toàn nền tảng (admin.md p2-07 §2.2) — CHỈ metadata: tiêu đề + mã họp, nhóm, chủ trì, giờ (theo trình duyệt, múi giờ cuộc họp ở
 * tooltip), trạng thái, nền tảng, số người (con số — không liệt kê), số phiên · thời lượng, số bản ghi hình. Không có cột agenda/địa điểm/link/tên người
 * tham dự (BE không trả, OPC-05). Sắp xếp phía SERVER: `startAt`, `attendeeCount` (chỉ giảm dần).
 */
export function buildMeetingColumns({
  hrefFor,
  onOpen,
  canForceEnd,
  onForceEnd,
}: MeetingColumnOptions): TableColumn<AdminMeetingRow>[] {
  const columns: TableColumn<AdminMeetingRow>[] = [
    {
      key: 'title',
      header: 'Tiêu đề',
      width: 240,
      cell: (row) => (
        <div className="min-w-0">
          <Link
            className="block truncate text-body-14 text-link hover:underline"
            title={row.title}
            to={hrefFor(row)}
            onClick={(e) => {
              e.stopPropagation();
              if (isModifiedClick(e)) return;
              e.preventDefault();
              onOpen(row);
            }}
          >
            {row.title}
          </Link>
          <div className="font-mono text-caption-12 text-fg-3">{row.code}</div>
        </div>
      ),
    },
    {
      key: 'workspace',
      header: 'Workspace',
      width: 160,
      cell: (row) =>
        row.workspace.name ? (
          <span className="block truncate text-fg-2">{row.workspace.name}</span>
        ) : (
          dash
        ),
    },
    {
      key: 'host',
      header: 'Chủ trì',
      width: 150,
      cell: (row) =>
        row.host.name ? (
          <span className="block truncate text-fg-2">{row.host.name}</span>
        ) : (
          <span className="text-fg-4">Không còn tài khoản</span>
        ),
    },
    {
      key: 'startAt',
      header: 'Bắt đầu – Kết thúc',
      width: 220,
      sortable: true,
      cell: (row) => {
        const { main, zoned } = formatMeetingTimes(row);
        const text = <span className="tabular-nums text-fg-1">{main}</span>;
        return zoned ? <Tooltip content={zoned}>{text}</Tooltip> : text;
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
              <span className="text-caption-12 text-fg-3">
                {MEETING_END_REASON_LABELS[row.endReason]}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'platform',
      header: 'Nền tảng',
      width: 120,
      cell: (row) => <span className="text-fg-3">{MEETING_PLATFORM_LABELS[row.platform]}</span>,
    },
    {
      key: 'attendeeCount',
      header: 'Số người',
      align: 'right',
      width: 100,
      sortable: true,
      cell: (row) => (
        <span className="tabular-nums text-fg-1">{formatCount(row.attendeeCount)}</span>
      ),
    },
    {
      key: 'sessions',
      header: 'Phiên · Thời lượng',
      width: 170,
      cell: (row) => (
        <span className="tabular-nums text-fg-2">
          {`${formatCount(row.sessionCount)} phiên · ${formatDurationSec(row.totalDurationSec)}`}
        </span>
      ),
    },
    {
      key: 'recordingCount',
      header: 'Ghi hình',
      align: 'right',
      width: 90,
      cell: (row) =>
        row.recordingCount > 0 ? (
          // Đi thẳng tới danh sách bản ghi CỦA cuộc họp này (BE lọc theo `meetingId`); 0 bản ghi thì không có gì để mở.
          <Link
            className="tabular-nums text-body-14 text-link hover:underline"
            title="Xem ghi hình của cuộc họp này"
            to={meetingOpsPath({
              tab: 'recordings',
              workspaceId: row.workspace.id,
              meetingId: row.id,
            })}
            onClick={stop}
          >
            {formatCount(row.recordingCount)}
          </Link>
        ) : (
          <span className="tabular-nums text-fg-2">{formatCount(row.recordingCount)}</span>
        ),
    },
  ];

  if (canForceEnd) {
    columns.push({
      key: 'actions',
      header: 'Hành động',
      align: 'right',
      width: 130,
      cell: (row) =>
        canForceEndMeeting(row.status) ? (
          <Button
            aria-label={`Kết thúc cuộc họp ${row.title}`}
            size="sm"
            skin="danger"
            variant="stroke"
            onClick={(e) => {
              stop(e);
              onForceEnd(row);
            }}
          >
            Kết thúc
          </Button>
        ) : null,
    });
  }

  return columns;
}
