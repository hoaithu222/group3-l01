import { Badge, Button } from '@/shared/ui';
import type { SystemIconName, TableColumn } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import type { TableSortValue } from '@/shared/hooks';
import { formatDate, formatNumber, statusBadge } from '@/shared/utils/format';

import {
  CHANNEL_POSTING_POLICY_LABELS,
  CHANNEL_TYPE_LABELS,
} from '../constants/workspace-channels.constants';
import type { AdminChannelRow, ChannelTypeValue } from '../types/workspace-channels.types';

const TYPE_ICON: Record<ChannelTypeValue, SystemIconName> = {
  TEXT: 'hashtag-outline',
  VOICE: 'microphone-outline',
  POMODORO: 'clock-outline',
};

/** Giá trị so sánh cho `useTableSort` — khớp `key` các cột `sortable` dưới đây. */
export function getChannelSortValue(row: AdminChannelRow, key: string): TableSortValue {
  switch (key) {
    case 'name':
      return row.name;
    case 'memberCount':
      return row.memberCount;
    case 'messages7d':
      return row.messages7d;
    case 'status':
      return row.status;
    case 'createdAt':
      return row.createdAt;
    default:
      return null;
  }
}

export interface BuildChannelColumnsParams {
  /** `moderation:update` — không có quyền thì cột hành động không render nút nào. */
  canModerate: boolean;
  onArchive: (row: AdminChannelRow) => void;
  onRestore: (row: AdminChannelRow) => void;
}

const ARCHIVE_REASON_LABELS: Record<NonNullable<AdminChannelRow['archiveReason']>, string> = {
  MANUAL: 'Chủ động',
  NO_MANAGER: 'Hết quản lý',
  PLATFORM: 'Quản trị nền tảng',
};

/**
 * Cấu hình cột bảng kênh PUBLIC (admin.md p1-03 §2.1) — tách khỏi
 * `WorkspaceChannelTable.tsx` để file component chính giữ ≤ 200 dòng, cùng
 * quy ước `workspace-member-table.columns.tsx` (p1-02).
 *
 * Kênh mặc định (`isDefault`): nút "Lưu trữ" hiện nhưng khoá + `title` giải
 * thích, cùng mẫu hàng OWNER ở `workspace-member-table.columns.tsx` (p1-02) —
 * `isDefault`/`archiveReason` được thêm vào `AdminChannelRow` phía BE sau khi
 * phát hiện DTO gốc thiếu 2 field này (README p1-03 §10).
 */
export function buildChannelColumns({
  canModerate,
  onArchive,
  onRestore,
}: BuildChannelColumnsParams): TableColumn<AdminChannelRow>[] {
  return [
    {
      key: 'name',
      header: 'Tên kênh',
      sortable: true,
      width: 220,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <SystemIcon className="shrink-0 text-fg-3" name={TYPE_ICON[row.type]} size={16} />
          <span className="truncate text-fg-1">{row.name}</span>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Loại',
      width: 110,
      cell: (row) => <span className="text-fg-3">{CHANNEL_TYPE_LABELS[row.type]}</span>,
    },
    {
      key: 'postingPolicy',
      header: 'Chính sách đăng',
      width: 150,
      cell: (row) => (
        <span className="text-fg-3">{CHANNEL_POSTING_POLICY_LABELS[row.postingPolicy]}</span>
      ),
    },
    {
      key: 'memberCount',
      header: 'Thành viên theo dõi',
      align: 'right',
      sortable: true,
      width: 150,
      cell: (row) => (
        <span className="tabular-nums text-fg-1">{formatNumber(row.memberCount)}</span>
      ),
    },
    {
      key: 'messages7d',
      header: 'Tin 7 ngày',
      align: 'right',
      sortable: true,
      width: 110,
      cell: (row) => <span className="tabular-nums text-fg-1">{formatNumber(row.messages7d)}</span>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      sortable: true,
      width: 120,
      cell: (row) => {
        const meta = statusBadge('channel', row.status);
        return (
          <div className="flex items-center gap-1.5">
            <Badge color={meta.variant} variant="tinted">
              {meta.label}
            </Badge>
            {row.status === 'ARCHIVED' && row.archiveReason && (
              <span className="text-caption-12 text-fg-3">
                ({ARCHIVE_REASON_LABELS[row.archiveReason]})
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'createdAt',
      header: 'Tạo lúc',
      align: 'right',
      sortable: true,
      width: 140,
      cell: (row) => (
        <span className="tabular-nums text-caption-12 text-fg-3">{formatDate(row.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 110,
      cell: (row) =>
        !canModerate ? null : (
          <div className="flex items-center justify-end gap-1">
            {row.status === 'ACTIVE' && (
              <Button
                disabled={row.isDefault}
                size="sm"
                skin="danger"
                title={
                  row.isDefault ? 'Kênh mặc định — chủ nhóm cần đổi kênh mặc định trước' : undefined
                }
                variant="ghost"
                onClick={() => onArchive(row)}
              >
                Lưu trữ
              </Button>
            )}
            {row.status === 'ARCHIVED' && (
              <Button size="sm" variant="ghost" onClick={() => onRestore(row)}>
                Khôi phục
              </Button>
            )}
          </div>
        ),
    },
  ];
}
