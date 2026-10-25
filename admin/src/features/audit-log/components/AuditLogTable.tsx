import { memo, useCallback, useMemo } from 'react';
import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';

import { useNavHref } from '@/shared/hooks';
import { Badge, Table, Tooltip } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { auditActionLabel, auditTargetTypeLabel } from '@/shared/constants/audit-actions';
import { isModifiedClick } from '@/shared/utils/browser/link.utils';
import { formatDate } from '@/shared/utils/format';

import {
  AUDIT_ACTOR_ROLE_LABEL,
  AUDIT_REASON_PREVIEW_LENGTH,
  AUDIT_UNKNOWN_ROLE,
} from '../constants/audit-log.constants';
import type { AuditLogDto } from '../types/audit-log.types';
import { auditTargetHref, auditWorkspaceHref } from '../utils/audit-target-href';

export interface AuditLogTableProps {
  rows: readonly AuditLogDto[];
  loading?: boolean;
  onRowClick: (row: AuditLogDto) => void;
  /** Bấm tên người thực hiện → lọc theo người đó. */
  onFilterActor: (actorId: string) => void;
}

const stop = (e: MouseEvent) => e.stopPropagation();

/** Vai người thực hiện: ưu tiên vai HIỆN TẠI (`actor.role`); `actorRole` = "unknown" thì bỏ. */
function actorRoleLabel(row: AuditLogDto): string | null {
  const role = row.actor?.role ?? (row.actorRole !== AUDIT_UNKNOWN_ROLE ? row.actorRole : null);
  return role ? (AUDIT_ACTOR_ROLE_LABEL[role] ?? role) : null;
}

/**
 * Bảng nhật ký — CHỈ ĐỌC. Không `Table pagination` (BE phân trang cursor): trang cha nối
 * thêm dòng bằng nút "Tải thêm". Cột IP không có ở đây (kit2 `Table` chưa hỗ trợ cột tuỳ
 * chọn) — xem trong drawer chi tiết. Không sort theo cột: BE cố định `at` giảm dần.
 */
const AuditLogTable = memo(function AuditLogTable({
  rows,
  loading,
  onRowClick,
  onFilterActor,
}: AuditLogTableProps) {
  const buildHref = useNavHref();

  const columns = useMemo<TableColumn<AuditLogDto>[]>(
    () => [
      {
        key: 'at',
        header: 'Thời gian',
        width: 150,
        cell: (row) => (
          <Tooltip content={row.at}>
            <span className="tabular-nums text-caption-12 text-fg-3">
              {formatDate(row.at, 'HH:mm:ss DD/MM/YYYY')}
            </span>
          </Tooltip>
        ),
      },
      {
        key: 'actor',
        header: 'Người thực hiện',
        width: 210,
        cell: (row) => {
          const role = actorRoleLabel(row);
          return (
            <div className="flex min-w-0 items-center gap-2">
              <Link
                className="min-w-0 truncate text-link hover:underline"
                title="Lọc theo người này"
                to={buildHref({ actorId: row.actorId })}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isModifiedClick(e)) return;
                  e.preventDefault();
                  onFilterActor(row.actorId);
                }}
              >
                {row.actor?.name ?? row.actorId}
              </Link>
              {role && (
                <Badge size="sm" variant="tinted">
                  {role}
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        key: 'action',
        header: 'Hành động',
        width: 220,
        cell: (row) => {
          const label = auditActionLabel(row.action);
          return (
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-fg-1">{label}</span>
              {label !== row.action && (
                <span className="truncate font-mono text-caption-12 text-fg-4">{row.action}</span>
              )}
            </div>
          );
        },
      },
      {
        key: 'target',
        header: 'Đối tượng',
        width: 230,
        cell: (row) => {
          const href = auditTargetHref(row);
          return (
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-fg-1">{auditTargetTypeLabel(row.targetType)}</span>
              {href ? (
                <Link
                  className="truncate font-mono text-caption-12 text-link hover:underline"
                  to={href}
                  onClick={stop}
                >
                  {row.targetId}
                </Link>
              ) : (
                <span className="truncate font-mono text-caption-12 text-fg-4">{row.targetId}</span>
              )}
            </div>
          );
        },
      },
      {
        key: 'workspaceId',
        header: 'Workspace',
        width: 130,
        cell: (row) =>
          row.workspaceId ? (
            <Link
              className="truncate font-mono text-caption-12 text-link hover:underline"
              title={row.workspaceId}
              to={auditWorkspaceHref(row.workspaceId)}
              onClick={stop}
            >
              {row.workspaceId.slice(-8)}
            </Link>
          ) : (
            <span className="text-fg-5">—</span>
          ),
      },
      {
        key: 'reason',
        header: 'Lý do',
        cell: (row) => {
          if (!row.reason) return <span className="text-fg-5">—</span>;
          const long = row.reason.length > AUDIT_REASON_PREVIEW_LENGTH;
          const text = long ? `${row.reason.slice(0, AUDIT_REASON_PREVIEW_LENGTH)}…` : row.reason;
          return long ? (
            <Tooltip content={row.reason}>
              <span className="text-fg-2">{text}</span>
            </Tooltip>
          ) : (
            <span className="text-fg-2">{text}</span>
          );
        },
      },
    ],
    [buildHref, onFilterActor],
  );

  const rowKey = useCallback((row: AuditLogDto) => row.id, []);
  const data = useMemo(() => [...rows], [rows]);

  return (
    <Table
      className="min-h-0 flex-1"
      columns={columns}
      data={data}
      fill
      loading={loading}
      minWidth={960}
      pagination={false}
      rowKey={rowKey}
      onRowClick={onRowClick}
    />
  );
});

export default AuditLogTable;
