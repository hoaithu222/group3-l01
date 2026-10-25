import { memo } from 'react';
import { Link } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import { Badge, BoxPanel } from '@/shared/ui';
import { formatDate, statusBadge } from '@/shared/utils/format';

import {
  REPORT_HANDLER_LEVEL_LABEL,
  REPORT_REASON_LABEL,
  REPORT_RESOLUTION_LABEL,
  REPORT_TARGET_TYPE_LABEL,
} from '../constants/moderation.constants';
import type { AdminReportGroup, ReportDetail } from '../types/moderation.types';
import { scopeLabel, userDetailPath, workspaceDetailPath } from '../utils/report-links';
import ReportInfoRow from './ReportInfoRow';

const TIME_FORMAT = 'HH:mm DD/MM/YYYY';

export interface ReportContextProps {
  group: AdminReportGroup;
  authorStats: ReportDetail['authorStats'];
}

/**
 * Khối "Ngữ cảnh" (admin.md p1-08 §2.2): workspace, phạm vi (tên CHỈ với kênh public), tác giả,
 * số báo cáo và thống kê tác giả 30 ngày. Chỉ metadata — nội dung nằm ở `ReportContentPanel`.
 */
const ReportContext = memo(function ReportContext({ group, authorStats }: ReportContextProps) {
  const canViewUser = useAuthStore((s) => s.hasPermission('user', 'view'));
  const status = statusBadge('report', group.status);
  const author = group.targetAuthor;

  return (
    <BoxPanel border="hairline" title="Ngữ cảnh">
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
        <ReportInfoRow label="Loại đích">
          <span>{REPORT_TARGET_TYPE_LABEL[group.targetType]}</span>
          {group.scope.isPrivate && (
            <Badge color="warning" size="sm" variant="tinted">
              Riêng tư
            </Badge>
          )}
        </ReportInfoRow>
        <ReportInfoRow label="Trạng thái">
          <Badge color={status.variant} size="sm" variant="tinted">
            {status.label}
          </Badge>
          {group.resolution && <span>{REPORT_RESOLUTION_LABEL[group.resolution]}</span>}
        </ReportInfoRow>
        <ReportInfoRow label="Workspace">
          {group.workspace ? (
            <Link
              className="text-link hover:underline"
              to={workspaceDetailPath(group.workspace.id)}
            >
              {group.workspace.name}
            </Link>
          ) : (
            <span className="text-fg-5">—</span>
          )}
        </ReportInfoRow>
        <ReportInfoRow label="Phạm vi">
          <span>{scopeLabel(group)}</span>
        </ReportInfoRow>
        <ReportInfoRow label="Tác giả/đối tượng">
          {author && canViewUser ? (
            <Link className="text-link hover:underline" to={userDetailPath(author.id)}>
              {author.name}
            </Link>
          ) : (
            <span className={author ? undefined : 'text-fg-5'}>{author?.name ?? '—'}</span>
          )}
        </ReportInfoRow>
        <ReportInfoRow label="Xử lý bởi">
          <span>{REPORT_HANDLER_LEVEL_LABEL[group.handlerLevel]}</span>
        </ReportInfoRow>
        <ReportInfoRow label="Số báo cáo">
          <span className="tabular-nums text-body-14-semibold">{group.reportCount}</span>
          <span className="tabular-nums text-caption-12 text-fg-4">
            {formatDate(group.firstAt, TIME_FORMAT)} → {formatDate(group.latestAt, TIME_FORMAT)}
          </span>
        </ReportInfoRow>
        <ReportInfoRow label="Lý do">
          {group.reasons.map((reason) => (
            <Badge key={reason} color="neutral" size="sm" variant="tinted">
              {REPORT_REASON_LABEL[reason]}
            </Badge>
          ))}
        </ReportInfoRow>
        <ReportInfoRow label="Tác giả trong 30 ngày">
          {authorStats ? (
            <span className="tabular-nums">
              {authorStats.reports30d} báo cáo · {authorStats.removed30d} tin bị gỡ
            </span>
          ) : (
            <span className="text-fg-5">—</span>
          )}
        </ReportInfoRow>
      </div>
    </BoxPanel>
  );
});

export default ReportContext;
