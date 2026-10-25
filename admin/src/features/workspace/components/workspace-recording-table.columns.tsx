import type { MouseEvent } from 'react';

import { Badge, Button, Tooltip } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate, formatFileSize, statusBadge } from '@/shared/utils/format';

import type { AdminRecordingRow } from '../types/workspace-recordings.types';
import {
  deleteBlockedReason,
  formatRecordingDuration,
  retentionLabel,
} from '../utils/workspace-recordings.utils';

const TIME_FORMAT = 'HH:mm DD/MM/YYYY';
const dash = <span className="text-fg-4">—</span>;
/** Bấm nút trong dòng không được kéo theo `onRowClick` (mở ngăn kéo chi tiết). */
const stop = (e: MouseEvent) => e.stopPropagation();

export interface RecordingColumnOptions {
  /** Cột "Workspace" chỉ có ý nghĩa ở danh sách toàn nền tảng; trong tab của một workspace thì ẩn. */
  showWorkspace: boolean;
  /** Có `meeting:delete` (chỉ `admin`) — thiếu thì KHÔNG có nút Xoá (manager không thấy). */
  canDelete: boolean;
  onDelete: (row: AdminRecordingRow) => void;
}

/**
 * Cột bảng bản ghi hình (admin.md p2-06 §2.2) — CHỈ metadata vận hành: giờ ghi, tiêu đề cuộc họp, người bắt đầu, thời lượng, dung lượng,
 * trạng thái, hạn lưu trữ. KHÔNG có cột/nút phát, tải hay đường dẫn tệp (D-24); BE cũng không trả mã họp hay danh sách người tham dự.
 * Sắp xếp phía SERVER (`sort` của BE) — bốn cột `sortable` khớp `RECORDING_SORT_KEYS`.
 */
export function buildRecordingColumns({
  showWorkspace,
  canDelete,
  onDelete,
}: RecordingColumnOptions): TableColumn<AdminRecordingRow>[] {
  const columns: TableColumn<AdminRecordingRow>[] = [
    {
      key: 'startedAt',
      header: 'Bắt đầu ghi',
      width: 150,
      sortable: true,
      cell: (row) => (
        <span className="tabular-nums text-fg-1">{formatDate(row.startedAt, TIME_FORMAT)}</span>
      ),
    },
    {
      key: 'meeting',
      header: 'Cuộc họp',
      width: 230,
      cell: (row) =>
        row.meeting.title ? (
          <span className="block truncate text-fg-1">{row.meeting.title}</span>
        ) : (
          <span className="text-fg-4">Cuộc họp không còn</span>
        ),
    },
  ];

  if (showWorkspace) {
    columns.push({
      key: 'workspace',
      header: 'Workspace',
      width: 150,
      cell: (row) =>
        row.workspace.name ? (
          <span className="block truncate text-fg-2">{row.workspace.name}</span>
        ) : (
          dash
        ),
    });
  }

  columns.push(
    {
      key: 'startedBy',
      header: 'Người bắt đầu',
      width: 150,
      cell: (row) =>
        row.startedBy.name ? (
          <span className="block truncate text-fg-2">{row.startedBy.name}</span>
        ) : (
          <span className="text-fg-4">Không còn tài khoản</span>
        ),
    },
    {
      key: 'durationSec',
      header: 'Thời lượng',
      align: 'right',
      width: 120,
      sortable: true,
      cell: (row) => (
        <span className="tabular-nums text-fg-2">{formatRecordingDuration(row.durationSec)}</span>
      ),
    },
    {
      key: 'fileSizeBytes',
      header: 'Dung lượng',
      align: 'right',
      width: 110,
      sortable: true,
      cell: (row) =>
        row.fileSizeBytes === null ? (
          dash
        ) : (
          <span className="tabular-nums text-fg-2">{formatFileSize(row.fileSizeBytes)}</span>
        ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 130,
      cell: (row) => {
        const meta = statusBadge('recording', row.status);
        return (
          <Badge color={meta.variant} variant="tinted">
            {meta.label}
          </Badge>
        );
      },
    },
    {
      key: 'retentionExpiresAt',
      header: 'Hết hạn',
      width: 170,
      sortable: true,
      cell: (row) => {
        if (row.deletedAt) {
          return (
            <div className="min-w-0">
              <div className="text-fg-3">{retentionLabel(row)}</div>
              {row.deleteReason && (
                <Tooltip content={row.deleteReason}>
                  <span className="block truncate text-caption-12 text-fg-4">
                    {row.deleteReason}
                  </span>
                </Tooltip>
              )}
            </div>
          );
        }
        if (!row.retentionExpiresAt) return dash;
        return (
          <div className="min-w-0">
            <div className="tabular-nums text-fg-1">{formatDate(row.retentionExpiresAt)}</div>
            <div
              className={
                row.retentionDaysLeft !== null && row.retentionDaysLeft <= 7
                  ? 'text-caption-12 text-warning'
                  : 'text-caption-12 text-fg-3'
              }
            >
              {retentionLabel(row)}
            </div>
          </div>
        );
      },
    },
  );

  if (canDelete) {
    columns.push({
      key: 'actions',
      header: '',
      align: 'right',
      width: 90,
      cell: (row) => {
        if (row.deletedAt) return null;
        const blocked = deleteBlockedReason(row);
        const button = (
          <Button
            aria-label={`Xoá bản ghi ${row.meeting.title ?? row.id}`}
            disabled={blocked !== null}
            size="sm"
            skin="danger"
            variant="ghost"
            onClick={(e) => {
              stop(e);
              onDelete(row);
            }}
          >
            Xoá
          </Button>
        );
        return blocked ? (
          <Tooltip content={blocked}>
            <span className="inline-flex">{button}</span>
          </Tooltip>
        ) : (
          button
        );
      },
    });
  }

  return columns;
}
