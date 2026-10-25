import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';

import { Badge, Tooltip } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate, statusBadge } from '@/shared/utils/format';

import {
  REPORT_REASON_LABEL,
  REPORT_RESOLUTION_LABEL,
  REPORT_TARGET_TYPE_LABEL,
} from '../constants/moderation.constants';
import type { AdminReportGroup } from '../types/moderation.types';
import {
  reportDetailPath,
  scopeLabel,
  userDetailPath,
  workspaceDetailPath,
} from '../utils/report-links';
import type { ReportNavState } from '../utils/report-links';

/** Số chip lý do hiện thẳng trên dòng — còn lại gộp vào `+N` (tooltip liệt kê đủ). */
const VISIBLE_REASONS = 2;
const TIME_FORMAT = 'HH:mm DD/MM/YYYY';

const stop = (e: MouseEvent) => e.stopPropagation();

export interface ReportColumnOptions {
  /** Ẩn cột Workspace (tab `reports` của workspace — ai cũng cùng một workspace). */
  hideWorkspace?: boolean;
  /** `user:view` — tên tác giả chỉ là liên kết khi người xem được mở hồ sơ người dùng. */
  canViewUser: boolean;
  /** State đi kèm liên kết chi tiết (nơi quay lại, giữ bộ lọc). */
  detailState: ReportNavState;
}

const dash = <span className="text-fg-5">—</span>;

/**
 * Cột bảng hàng đợi báo cáo (admin.md p1-08 §2.1). Thứ tự/độ rộng cố định; KHÔNG có sort theo cột
 * (BE chỉ có hai khoá cùng chiều giảm dần — chọn ở ô "Sắp xếp" của bộ lọc). Tên phạm vi chỉ hiện
 * với kênh public, xem `scopeLabel`.
 */
export function buildReportColumns({
  hideWorkspace,
  canViewUser,
  detailState,
}: ReportColumnOptions): TableColumn<AdminReportGroup>[] {
  const columns: TableColumn<AdminReportGroup>[] = [
    {
      key: 'target',
      header: 'Đích',
      width: 190,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <Link
            className="min-w-0 truncate text-link hover:underline"
            state={detailState}
            to={reportDetailPath(row.reportId)}
            onClick={stop}
          >
            {REPORT_TARGET_TYPE_LABEL[row.targetType]}
          </Link>
          {row.scope.isPrivate && (
            <Badge color="warning" size="sm" variant="tinted">
              Riêng tư
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'reportCount',
      header: 'Số báo cáo',
      align: 'right',
      width: 100,
      cell: (row) => (
        <span className="tabular-nums text-body-14-semibold text-fg-1">{row.reportCount}</span>
      ),
    },
    {
      key: 'reasons',
      header: 'Lý do',
      width: 240,
      cell: (row) => {
        const extra = row.reasons.slice(VISIBLE_REASONS);
        return (
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {row.reasons.slice(0, VISIBLE_REASONS).map((reason) => (
              <Badge key={reason} color="neutral" size="sm" variant="tinted">
                {REPORT_REASON_LABEL[reason]}
              </Badge>
            ))}
            {extra.length > 0 && (
              <Tooltip content={extra.map((r) => REPORT_REASON_LABEL[r]).join(', ')}>
                <Badge color="neutral" size="sm" variant="outline">{`+${extra.length}`}</Badge>
              </Tooltip>
            )}
          </div>
        );
      },
    },
  ];

  if (!hideWorkspace) {
    columns.push({
      key: 'workspace',
      header: 'Workspace',
      width: 160,
      cell: (row) =>
        row.workspace ? (
          <Link
            className="truncate text-link hover:underline"
            to={workspaceDetailPath(row.workspace.id)}
            onClick={stop}
          >
            {row.workspace.name}
          </Link>
        ) : (
          dash
        ),
    });
  }

  columns.push(
    {
      key: 'scope',
      header: 'Phạm vi',
      width: 150,
      cell: (row) => <span className="truncate text-fg-2">{scopeLabel(row)}</span>,
    },
    {
      key: 'author',
      header: 'Tác giả/đối tượng',
      width: 170,
      cell: (row) => {
        const author = row.targetAuthor;
        if (!author) return dash;
        return canViewUser ? (
          <Link
            className="truncate text-link hover:underline"
            to={userDetailPath(author.id)}
            onClick={stop}
          >
            {author.name}
          </Link>
        ) : (
          <span className="truncate text-fg-2">{author.name}</span>
        );
      },
    },
    {
      key: 'time',
      header: 'Lần đầu / gần nhất',
      width: 160,
      cell: (row) => (
        <div className="flex flex-col tabular-nums text-caption-12">
          <span className="text-fg-4">{formatDate(row.firstAt, TIME_FORMAT)}</span>
          <span className="text-fg-2">{formatDate(row.latestAt, TIME_FORMAT)}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 150,
      cell: (row) => {
        const meta = statusBadge('report', row.status);
        return (
          <div className="flex min-w-0 flex-col items-start gap-0.5">
            <Badge color={meta.variant} size="sm" variant="tinted">
              {meta.label}
            </Badge>
            {row.resolution && (
              <span className="truncate text-caption-12 text-fg-4">
                {REPORT_RESOLUTION_LABEL[row.resolution]}
              </span>
            )}
          </div>
        );
      },
    },
  );

  return columns;
}
