import { memo } from 'react';
import { Link } from 'react-router-dom';

import { Badge, Drawer, JsonViewer } from '@/shared/ui';
import { auditActionLabel, auditTargetTypeLabel } from '@/shared/constants/audit-actions';
import { formatDate } from '@/shared/utils/format';

import { AUDIT_ACTOR_ROLE_LABEL, AUDIT_UNKNOWN_ROLE } from '../constants/audit-log.constants';
import type { AuditLogDto } from '../types/audit-log.types';
import {
  auditTargetHref,
  auditWorkspaceHref,
  extractBeforeAfter,
} from '../utils/audit-target-href';
import AuditInfoRow from './AuditInfoRow';

export interface AuditLogDetailDrawerProps {
  /** `null` = đóng. */
  row: AuditLogDto | null;
  onClose: () => void;
}

const MONO = 'font-mono text-caption-12 text-fg-2';

/**
 * Chi tiết MỘT dòng nhật ký — chỉ đọc tuyệt đối (không có hành động nào ngoài "Chép" của
 * `JsonViewer` và đóng). Hiện đủ thứ bảng không có chỗ: IP, user-agent, lý do đầy đủ,
 * `metadata` dạng JSON, và khối Trước/Sau khi `metadata` mang cặp `before/after` (hoặc
 * `from/to`, vd đổi vai trò thành viên).
 */
const AuditLogDetailDrawer = memo(function AuditLogDetailDrawer({
  row,
  onClose,
}: AuditLogDetailDrawerProps) {
  const href = row ? auditTargetHref(row) : null;
  const diff = row ? extractBeforeAfter(row.metadata) : null;
  const roleAtTime =
    row && row.actorRole !== AUDIT_UNKNOWN_ROLE
      ? (AUDIT_ACTOR_ROLE_LABEL[row.actorRole] ?? row.actorRole)
      : null;

  return (
    <Drawer
      open={row !== null}
      side="right"
      size="lg"
      title={row ? auditActionLabel(row.action) : ''}
      onOpenChange={(next) => !next && onClose()}
    >
      {row && (
        <div className="flex flex-col gap-3">
          <div className="border border-border-1 bg-bg-2/30 px-3">
            <AuditInfoRow label="Thời gian">
              <div className="flex flex-col">
                <span className="tabular-nums">{formatDate(row.at, 'HH:mm:ss DD/MM/YYYY')}</span>
                <span className={MONO}>{row.at}</span>
              </div>
            </AuditInfoRow>
            <AuditInfoRow label="Hành động">
              <div className="flex flex-col">
                <span>{auditActionLabel(row.action)}</span>
                <span className={MONO}>{row.action}</span>
              </div>
            </AuditInfoRow>
            <AuditInfoRow label="Người thực hiện">
              <div className="flex flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span>{row.actor?.name ?? 'Không còn tài khoản'}</span>
                  {row.actor && (
                    <Badge size="sm" variant="tinted">
                      {AUDIT_ACTOR_ROLE_LABEL[row.actor.role] ?? row.actor.role}
                    </Badge>
                  )}
                </div>
                <span className={MONO}>{row.actorId}</span>
                {roleAtTime && (
                  <span className="text-caption-12 text-fg-4">Vai lúc thao tác: {roleAtTime}</span>
                )}
              </div>
            </AuditInfoRow>
            <AuditInfoRow label="Đối tượng">
              <div className="flex flex-col">
                <span>{auditTargetTypeLabel(row.targetType)}</span>
                {href ? (
                  <Link className="font-mono text-caption-12 text-link hover:underline" to={href}>
                    {row.targetId}
                  </Link>
                ) : (
                  <span className={MONO}>{row.targetId}</span>
                )}
              </div>
            </AuditInfoRow>
            <AuditInfoRow label="Workspace">
              {row.workspaceId ? (
                <Link
                  className="font-mono text-caption-12 text-link hover:underline"
                  to={auditWorkspaceHref(row.workspaceId)}
                >
                  {row.workspaceId}
                </Link>
              ) : (
                <span className="text-fg-5">—</span>
              )}
            </AuditInfoRow>
            <AuditInfoRow label="Lý do">
              {row.reason ? (
                <span className="whitespace-pre-wrap">{row.reason}</span>
              ) : (
                <span className="text-fg-5">—</span>
              )}
            </AuditInfoRow>
            <AuditInfoRow label="Địa chỉ IP">
              <span className={MONO}>{row.ip ?? '—'}</span>
            </AuditInfoRow>
            <AuditInfoRow label="Thiết bị">
              <span className="text-caption-12 text-fg-2">{row.userAgent ?? '—'}</span>
            </AuditInfoRow>
          </div>

          {diff && (
            <section aria-label="So sánh trước và sau" className="grid grid-cols-2 gap-2">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-caption-12-medium text-fg-3">Trước</span>
                <JsonViewer hideCopy maxHeight={200} value={diff.before} />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-caption-12-medium text-fg-3">Sau</span>
                <JsonViewer hideCopy maxHeight={200} value={diff.after} />
              </div>
            </section>
          )}

          <section aria-label="Metadata" className="flex flex-col gap-1">
            <span className="text-caption-12-medium text-fg-3">Metadata</span>
            <JsonViewer value={row.metadata ?? undefined} />
          </section>
        </div>
      )}
    </Drawer>
  );
});

export default AuditLogDetailDrawer;
