import { Badge, Button, CopyableText } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import type { FailedJob, FailedJobAction } from '../types/jobs.types';
import { formatEpoch } from '../utils/jobs-format';

export interface BuildFailedJobColumnsParams {
  /** `system-config:update` — thiếu thì KHÔNG có cột hành động (không nút vô hiệu hoá). */
  canUpdate: boolean;
  /** Mở drawer xem đầy đủ lỗi + payload đã che. */
  onOpen: (job: FailedJob) => void;
  onAction: (job: FailedJob, action: FailedJobAction) => void;
}

/**
 * Cột bảng "Job lỗi" (admin.md p0-04 §2.2). Ô "Lý do lỗi" là nút ghost — mở
 * drawer bằng bàn phím được, thay vì `onRowClick` (dòng không có vai trò nút).
 */
export function buildFailedJobColumns({
  canUpdate,
  onOpen,
  onAction,
}: BuildFailedJobColumnsParams): TableColumn<FailedJob>[] {
  const columns: TableColumn<FailedJob>[] = [
    {
      key: 'finishedOn',
      header: 'Thời gian lỗi',
      width: 170,
      cell: (row) => (
        <span className="tabular-nums text-caption-12 text-fg-3">
          {formatEpoch(row.finishedOn ?? row.timestamp)}
        </span>
      ),
    },
    {
      key: 'job',
      header: 'Hàng đợi · Tên job',
      width: 240,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <Badge size="sm" variant="tinted">
            {row.queue}
          </Badge>
          <span className="truncate text-fg-1" title={row.name}>
            {row.name}
          </span>
        </div>
      ),
    },
    {
      key: 'jobId',
      header: 'Job ID',
      width: 240,
      cell: (row) => <CopyableText label="Job ID" value={row.jobId} />,
    },
    {
      key: 'attemptsMade',
      header: 'Lần thử',
      align: 'right',
      width: 90,
      cell: (row) => <span className="tabular-nums text-fg-2">{row.attemptsMade}</span>,
    },
    {
      key: 'failedReason',
      header: 'Lý do lỗi',
      cell: (row) => (
        <Button
          className="max-w-full justify-start"
          size="sm"
          skin="neutral"
          title="Xem chi tiết lỗi và dữ liệu job"
          variant="ghost"
          onClick={() => onOpen(row)}
        >
          <span className="truncate">{row.failedReason ?? '(không có thông điệp lỗi)'}</span>
        </Button>
      ),
    },
  ];

  if (canUpdate) {
    columns.push({
      key: 'actions',
      header: '',
      width: 210,
      cell: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            startIcon={<SystemIcon name="arrows-rotate-outline" size={14} />}
            variant="ghost"
            onClick={() => onAction(row, 'retry')}
          >
            Chạy lại
          </Button>
          <Button
            size="sm"
            skin="danger"
            startIcon={<SystemIcon name="trash-can-outline" size={14} />}
            variant="ghost"
            onClick={() => onAction(row, 'remove')}
          >
            Gỡ bỏ
          </Button>
        </div>
      ),
    });
  }

  return columns;
}
