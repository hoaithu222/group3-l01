import { memo } from 'react';
import { Link } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import { Badge, BoxPanel, Callout } from '@/shared/ui';
import { formatDate } from '@/shared/utils/format';

import type { AdminReportGroup } from '../../types/moderation.types';
import type { AdminPortfolio } from '../../types/portfolio-moderation.types';
import { portfolioStatusMeta, safePublicUrl } from '../../utils/portfolio-status';
import { userDetailPath } from '../../utils/report-links';
import ReportInfoRow from '../ReportInfoRow';

const TIME_FORMAT = 'HH:mm DD/MM/YYYY';

export interface PortfolioReportContextProps {
  portfolio: AdminPortfolio;
  /** Nhóm báo cáo — lấy tên chủ hồ sơ (`targetAuthor`) thay vì gọi thêm API. */
  group: AdminReportGroup;
}

/**
 * Khối "Portfolio bị báo cáo" (p6-07): tên hiển thị, đường dẫn, trạng thái (bằng CHỮ), chủ hồ sơ (liên kết khi có `user:view`), lần công khai
 * gần nhất và thông tin gỡ (lý do, thời điểm). CHỈ metadata — BE không trả nội dung hồ sơ; muốn xem nội dung, mở trang công khai qua liên
 * kết (chỉ khi hồ sơ ĐANG công khai — trang đã gỡ/ngừng công khai trả 404 nên không có liên kết).
 */
const PortfolioReportContext = memo(function PortfolioReportContext({
  portfolio,
  group,
}: PortfolioReportContextProps) {
  const canViewUser = useAuthStore((s) => s.hasPermission('user', 'view'));
  const status = portfolioStatusMeta(portfolio);
  const publicUrl = safePublicUrl(portfolio.publicUrl);
  const owner = group.targetAuthor;

  return (
    <BoxPanel border="hairline" title="Portfolio bị báo cáo">
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
        <ReportInfoRow label="Tên hiển thị">
          <span className="text-body-14-semibold">{portfolio.displayName}</span>
        </ReportInfoRow>
        <ReportInfoRow label="Đường dẫn">
          <span className="font-mono">{`/p/${portfolio.slug}`}</span>
        </ReportInfoRow>
        <ReportInfoRow label="Chủ hồ sơ">
          {owner && canViewUser ? (
            <Link className="text-link hover:underline" to={userDetailPath(portfolio.userId)}>
              {owner.name}
            </Link>
          ) : (
            <span className={owner ? undefined : 'text-fg-5'}>{owner?.name ?? '—'}</span>
          )}
        </ReportInfoRow>
        <ReportInfoRow label="Trạng thái">
          <Badge color={status.color} size="sm" variant="tinted">
            {status.label}
          </Badge>
        </ReportInfoRow>
        <ReportInfoRow label="Công khai lần gần nhất">
          <span className="tabular-nums">
            {portfolio.publishedAt ? formatDate(portfolio.publishedAt, TIME_FORMAT) : '—'}
          </span>
        </ReportInfoRow>
        <ReportInfoRow label="Trang công khai">
          {publicUrl ? (
            <a
              className="min-w-0 truncate text-link hover:underline"
              href={publicUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Mở trang công khai
            </a>
          ) : (
            <span className="text-fg-5">Không còn công khai</span>
          )}
        </ReportInfoRow>
      </div>
      {portfolio.takenDownAt && (
        <div className="border-t border-divider-1 p-3">
          <Callout
            description={
              portfolio.takedownReason
                ? `Lý do: ${portfolio.takedownReason}`
                : 'Không có lý do được ghi lại.'
            }
            intent="warning"
            title={`Đã gỡ lúc ${formatDate(portfolio.takenDownAt, TIME_FORMAT)}`}
          />
        </div>
      )}
    </BoxPanel>
  );
});

export default PortfolioReportContext;
