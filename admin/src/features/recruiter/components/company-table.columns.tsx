import { Link } from 'react-router-dom';

import { Badge } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate, formatNumber } from '@/shared/utils/format';

import { COMPANY_TIER_LABEL } from '../constants/recruiter.constants';
import type { AdminCompanyItem } from '../types/recruiter.types';
import { safeExternalUrl } from '../utils/external-url';
import CompanyStatusBadge from './CompanyStatusBadge';

export interface CompanyColumnOptions {
  /** Đường dẫn mở ngăn kéo chi tiết (giữ bộ lọc hiện tại) — tên là `<Link>` thật (chuột giữa/Ctrl+click mở tab mới). */
  detailHref: (companyId: string) => string;
}

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

/**
 * Cột bảng doanh nghiệp (admin.md p6-08 §2.1). BE KHÔNG trả logo và MST ở danh sách nên hai cột đó nằm ở ngăn kéo chi tiết;
 * "Lời mời tháng này / hạn mức" là `offersThisMonth / quota`. Website là liên kết ngoài: chỉ nhận http(s) (`safeExternalUrl`).
 */
export function buildCompanyColumns({ detailHref }: CompanyColumnOptions): TableColumn<AdminCompanyItem>[] {
  return [
    {
      key: 'name',
      header: 'Doanh nghiệp',
      width: 240,
      cell: (c) => (
        <Link
          className="block truncate text-body-14 text-link hover:underline"
          to={detailHref(c.id)}
          onClick={stop}
        >
          {c.name}
        </Link>
      ),
    },
    {
      key: 'website',
      header: 'Website',
      width: 200,
      cell: (c) => {
        const url = safeExternalUrl(c.website);
        return url ? (
          <a
            className="block truncate text-link hover:underline"
            href={url}
            rel="noopener noreferrer"
            target="_blank"
            onClick={stop}
          >
            {c.website}
          </a>
        ) : (
          <span className="text-fg-5">—</span>
        );
      },
    },
    {
      key: 'tier',
      header: 'Gói',
      width: 110,
      cell: (c) => (
        <Badge color="neutral" size="sm" variant="tinted">
          {COMPANY_TIER_LABEL[c.tier]}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 120,
      cell: (c) => <CompanyStatusBadge status={c.status} />,
    },
    {
      key: 'members',
      header: 'Thành viên',
      width: 100,
      align: 'right',
      cell: (c) => <span className="tabular-nums">{formatNumber(c.membersCount)}</span>,
    },
    {
      key: 'offers',
      header: 'Lời mời tháng này',
      width: 150,
      align: 'right',
      cell: (c) => (
        <span className="tabular-nums">
          {formatNumber(c.offersThisMonth)} / {formatNumber(c.quota)}
        </span>
      ),
    },
    {
      key: 'reported',
      header: 'Báo cáo mở',
      width: 110,
      align: 'right',
      cell: (c) =>
        c.reportedCount > 0 ? (
          <span className="tabular-nums text-body-14-semibold text-fg-1">{c.reportedCount}</span>
        ) : (
          <span className="text-fg-5">—</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'Ngày đăng ký',
      width: 130,
      cell: (c) => (
        <span className="tabular-nums text-caption-12 text-fg-3">
          {formatDate(c.createdAt, 'DD/MM/YYYY')}
        </span>
      ),
    },
  ];
}
