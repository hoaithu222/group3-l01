import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';

import { Badge, Button } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { isModifiedClick } from '@/shared/utils/browser/link.utils';
import { formatDate, statusBadge } from '@/shared/utils/format';

import {
  CALL_MEDIA_LABELS,
  CALL_MODE_LABELS,
  CALL_SCOPE_LABELS,
} from '../../constants/call.constants';
import type { AdminCallRow } from '../../types/call.types';
import { canForceEndCall } from '../../utils/call-ops.utils';
import {
  formatCount,
  formatDurationSec,
  meetingOpsPath,
  TIME_FORMAT,
} from '../../utils/meeting-ops.utils';

const dash = <span className="text-fg-4">—</span>;
/** Bấm nút/liên kết trong dòng không được kéo theo `onRowClick` (mở ngăn kéo chi tiết). */
const stop = (e: MouseEvent) => e.stopPropagation();

export interface CallColumnOptions {
  /** URL THẬT mở ngăn kéo cuộc gọi (giữ bộ lọc) — Ctrl+click mở tab mới được. */
  hrefFor: (row: AdminCallRow) => string;
  onOpen: (row: AdminCallRow) => void;
  /** Có `meeting:update` — thiếu thì KHÔNG có nút "Kết thúc". */
  canForceEnd: boolean;
  onForceEnd: (row: AdminCallRow) => void;
}

/**
 * Cột bảng cuộc gọi toàn nền tảng (admin.md p2-07 §2.3) — CHỈ metadata. Nhãn cuộc gọi (`label`) ĐÃ CHE ở BE ("Cuộc gọi 1-1" / "Nhóm chat" / "Kênh riêng tư")
 * nên in nguyên văn; cuộc gọi của cuộc họp là liên kết mở ngăn kéo cuộc họp. Không cột người tham gia (OPC-05). Sắp xếp phía SERVER: `startedAt`,
 * `durationSec`, `peakParticipants` (hai cột sau chỉ giảm dần). "Kết thúc" chỉ với cuộc gọi chưa kết thúc và KHÔNG thuộc cuộc họp.
 */
export function buildCallColumns({
  hrefFor,
  onOpen,
  canForceEnd,
  onForceEnd,
}: CallColumnOptions): TableColumn<AdminCallRow>[] {
  const columns: TableColumn<AdminCallRow>[] = [
    {
      key: 'startedAt',
      header: 'Bắt đầu',
      width: 150,
      sortable: true,
      cell: (row) => (
        <Link
          className="text-body-14 text-link tabular-nums hover:underline"
          to={hrefFor(row)}
          onClick={(e) => {
            stop(e);
            if (isModifiedClick(e)) return;
            e.preventDefault();
            onOpen(row);
          }}
        >
          {formatDate(row.startedAt, TIME_FORMAT)}
        </Link>
      ),
    },
    {
      key: 'label',
      header: 'Cuộc gọi',
      width: 220,
      cell: (row) =>
        row.meeting ? (
          <Link
            className="block truncate text-body-14 text-link hover:underline"
            title={`Mở cuộc họp ${row.meeting.title}`}
            to={meetingOpsPath({ tab: 'meetings', id: row.meeting.id })}
            onClick={stop}
          >
            {row.meeting.title}
          </Link>
        ) : (
          <span className="block truncate text-fg-1">{row.label}</span>
        ),
    },
    {
      key: 'scopeType',
      header: 'Phạm vi',
      width: 110,
      cell: (row) => <span className="text-fg-3">{CALL_SCOPE_LABELS[row.scopeType]}</span>,
    },
    {
      key: 'mode',
      header: 'Chế độ · Media',
      width: 150,
      cell: (row) => (
        <span className="text-fg-2">{`${CALL_MODE_LABELS[row.mode]} · ${CALL_MEDIA_LABELS[row.mediaKind]}`}</span>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 140,
      cell: (row) => {
        const meta = statusBadge('call', row.status);
        return (
          <Badge color={meta.variant} variant="tinted">
            {meta.label}
          </Badge>
        );
      },
    },
    {
      key: 'endReason',
      header: 'Lý do kết thúc',
      width: 160,
      cell: (row) => {
        if (!row.endReason) return dash;
        const meta = statusBadge('callEndReason', row.endReason);
        return (
          <Badge color={meta.variant} variant="tinted">
            {meta.label}
          </Badge>
        );
      },
    },
    {
      key: 'durationSec',
      header: 'Thời lượng',
      align: 'right',
      width: 110,
      sortable: true,
      cell: (row) => (
        <span className="tabular-nums text-fg-2">{formatDurationSec(row.durationSec)}</span>
      ),
    },
    {
      key: 'peakParticipants',
      header: 'Tối đa người · Được mời',
      align: 'right',
      width: 150,
      sortable: true,
      cell: (row) => (
        <span className="tabular-nums text-fg-2">{`${formatCount(row.peakParticipants)} · ${formatCount(row.invitedCount)}`}</span>
      ),
    },
    {
      key: 'workspace',
      header: 'Workspace',
      width: 150,
      cell: (row) =>
        row.workspace?.name ? (
          <span className="block truncate text-fg-2">{row.workspace.name}</span>
        ) : (
          dash
        ),
    },
  ];

  if (canForceEnd) {
    columns.push({
      key: 'actions',
      header: 'Hành động',
      align: 'right',
      width: 120,
      cell: (row) =>
        canForceEndCall(row) ? (
          <Button
            aria-label={`Kết thúc cuộc gọi ${row.label}`}
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
