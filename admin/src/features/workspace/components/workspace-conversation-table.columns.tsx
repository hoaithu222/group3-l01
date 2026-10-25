import { Badge, CopyableText } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate, formatNumber, statusBadge } from '@/shared/utils/format';

import { CONVERSATION_TYPE_LABELS } from '../constants/workspace-conversations.constants';
import type { AdminConversationRow } from '../types/workspace-conversations.types';

/**
 * Cấu hình cột bảng hội thoại NHÓM (admin.md p1-05 §2.1) — tách khỏi
 * `WorkspaceConversationTable.tsx`, cùng quy ước `workspace-channel-table.columns.tsx`
 * (p1-03). KHÔNG có cột tên nhóm — quyết định riêng tư D-06, xem docblock
 * `AdminConversationRow`.
 *
 * Không có cột hành động: giải tán nhóm chỉ thực hiện từ hàng đợi báo cáo
 * (module `moderation`, p1-08, admin.md §2.2) — bấm hàng ở đây không làm gì
 * (admin.md dòng 31 "tránh gợi ý có dữ liệu ẩn").
 */
export function buildConversationColumns(): TableColumn<AdminConversationRow>[] {
  return [
    {
      key: 'code',
      header: 'Mã',
      width: 120,
      // Hiện 6 ký tự cuối cho gọn; bấm chép TOÀN BỘ id (admin.md p1-05 §2.1 "copy được") để tra chính xác trong DB/log.
      cell: (row) => <CopyableText display={`#${row.id.slice(-6)}`} label="mã hội thoại" value={row.id} />,
    },
    {
      key: 'type',
      header: 'Loại',
      width: 130,
      cell: (row) => (
        <span className="text-fg-3">
          {row.isMeetingGroup ? CONVERSATION_TYPE_LABELS.meeting : CONVERSATION_TYPE_LABELS.regular}
        </span>
      ),
    },
    {
      key: 'memberCount',
      header: 'Thành viên',
      align: 'right',
      width: 100,
      cell: (row) => <span className="tabular-nums text-fg-1">{formatNumber(row.memberCount)}</span>,
    },
    {
      key: 'ownerName',
      header: 'Chủ nhóm',
      width: 160,
      // admin.md §2.1 — TÊN chủ nhóm được phép hiện (khác tên nhóm/thành viên
      // khác), ghi rõ lý do "cần cho trách nhiệm pháp lý".
      cell: (row) => <span className="truncate text-fg-1">{row.ownerName ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 130,
      cell: (row) => {
        const meta = statusBadge('conversation', row.status);
        return (
          <Badge color={meta.variant} variant="tinted">
            {meta.label}
          </Badge>
        );
      },
    },
    {
      key: 'createdAt',
      header: 'Tạo lúc',
      align: 'right',
      width: 140,
      cell: (row) => <span className="tabular-nums text-caption-12 text-fg-3">{formatDate(row.createdAt)}</span>,
    },
    {
      key: 'lastActivityAt',
      header: 'Hoạt động gần nhất',
      align: 'right',
      width: 160,
      // Server LUÔN trả theo `activityAt desc` (không có query param sort) —
      // xem docblock `WorkspaceConversationsTab` cho quyết định không bật cột
      // sort tương tác (chỉ sort được TRONG trang hiện tại, gây hiểu lầm với
      // phân trang server thật).
      cell: (row) => (
        <span className="tabular-nums text-caption-12 text-fg-3">{formatDate(row.lastActivityAt, 'HH:mm DD/MM/YYYY')}</span>
      ),
    },
  ];
}
