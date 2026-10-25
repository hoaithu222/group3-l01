import { Link } from 'react-router-dom';

import { Badge, Button, Tooltip } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { formatDate, statusBadge } from '@/shared/utils/format';

import type { AdminMemberRow } from '../types/workspace-members.types';
import GuestExpiryCell from './GuestExpiryCell';

/**
 * `/user` viết cứng CÓ CHỦ ĐÍCH — file này nằm trên nhánh `page.lazy` của
 * `workspaceModule` (qua `WorkspaceDetailPage` → `WorkspaceMembersTab` →
 * `WorkspaceMemberTable` → đây); import `MODULE_PATHS`/`module-registry.ts`
 * sẽ khép vòng (`npm run check:cycles`), cùng lý do đã ghi ở `WorkspaceTable.tsx`.
 */
const USER_MODULE_PATH = '/user';

export interface BuildMemberColumnsParams {
  /** `user:view` — gộp cột Email + link `/user/:id` (admin.md p1-02 §1/§2.1). */
  canViewUser: boolean;
  /** `workspace:update` — hàng OWNER vẫn hiện nút nhưng khoá + `title` giải thích. */
  canRevoke: boolean;
  canViewAuditLog: boolean;
  onRevoke: (row: AdminMemberRow) => void;
  onViewAuditLog: (row: AdminMemberRow) => void;
}

/**
 * Cấu hình cột bảng thành viên (admin.md p1-02 §2.1) — tách khỏi
 * `WorkspaceMemberTable.tsx` để file component chính giữ ≤ 200 dòng
 * (`clean-code-standards.md` §3/§4, mẫu `columns.tsx`).
 */
export function buildMemberColumns({
  canViewUser,
  canRevoke,
  canViewAuditLog,
  onRevoke,
  onViewAuditLog,
}: BuildMemberColumnsParams): TableColumn<AdminMemberRow>[] {
  const cols: TableColumn<AdminMemberRow>[] = [
    {
      key: 'user',
      header: 'Người dùng',
      width: 200,
      cell: (row) =>
        canViewUser ? (
          <Link className="truncate text-link hover:underline" to={`${USER_MODULE_PATH}?id=${row.user.id}`}>
            {row.user.name}
          </Link>
        ) : (
          <span className="truncate text-fg-1">{row.user.name}</span>
        ),
    },
  ];

  if (canViewUser) {
    cols.push({
      key: 'email',
      header: 'Email',
      width: 200,
      cell: (row) => <span className="truncate text-fg-3">{row.user.email ?? '—'}</span>,
    });
  }

  cols.push(
    {
      key: 'role',
      header: 'Vai trò',
      width: 130,
      cell: (row) => {
        const meta = statusBadge('workspaceRole', row.role);
        return (
          <Badge color={meta.variant} variant="tinted">
            {meta.label}
          </Badge>
        );
      },
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 130,
      cell: (row) => {
        const meta = statusBadge('workspaceMember', row.status);
        return (
          <Badge color={meta.variant} variant="tinted">
            {meta.label}
          </Badge>
        );
      },
    },
    {
      key: 'joinedAt',
      header: 'Tham gia lúc',
      align: 'right',
      width: 140,
      cell: (row) => (
        <span className="tabular-nums text-caption-12 text-fg-3">{formatDate(row.joinedAt)}</span>
      ),
    },
    {
      // BE KHÔNG join tên người mời (`member.presenter.ts#toAdminMemberRow` chỉ
      // trả thẳng `membership.invitedBy` — 1 id) — hiện 6 ký tự cuối id thay vì
      // tên đầy đủ, xem docblock `AdminMemberRow.invitedBy`.
      key: 'invitedBy',
      header: 'Mời bởi',
      width: 110,
      cell: (row) =>
        row.invitedBy ? (
          canViewUser ? (
            <Link
              className="truncate text-link hover:underline"
              to={`${USER_MODULE_PATH}?id=${row.invitedBy}`}
            >
              #{row.invitedBy.slice(-6)}
            </Link>
          ) : (
            <span className="truncate text-fg-3">#{row.invitedBy.slice(-6)}</span>
          )
        ) : (
          <span className="text-fg-4">—</span>
        ),
    },
    {
      key: 'expiresAt',
      header: 'Hết hạn khách',
      align: 'right',
      width: 140,
      cell: (row) => <GuestExpiryCell expiresAt={row.expiresAt} />,
    },
    {
      key: 'banReason',
      header: 'Lý do chặn',
      align: 'center',
      width: 90,
      cell: (row) =>
        row.banReason ? (
          <Tooltip content={row.banReason}>
            <span className="inline-flex">
              <SystemIcon className="text-fg-3" name="circle-exclamation-outline" size={16} />
            </span>
          </Tooltip>
        ) : (
          <span className="text-fg-4">—</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      width: 208,
      cell: (row) => (
        <div className="flex items-center justify-end gap-1">
          {canViewAuditLog && (
            <Button size="sm" variant="ghost" onClick={() => onViewAuditLog(row)}>
              Nhật ký
            </Button>
          )}
          {canRevoke && row.status === 'ACTIVE' && (
            <Button
              disabled={row.role === 'OWNER'}
              size="sm"
              skin="danger"
              title={row.role === 'OWNER' ? 'Lưu trữ workspace nếu cần xử lý chủ nhóm' : undefined}
              variant="ghost"
              onClick={() => onRevoke(row)}
            >
              Thu hồi
            </Button>
          )}
        </div>
      ),
    },
  );

  return cols;
}
