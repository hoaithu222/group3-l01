import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';

import { Table } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import type { RecruiterStats } from '../types/recruiter.types';

type TopCompany = RecruiterStats['topCompanies'][number];

export interface RecruiterTopCompaniesProps {
  data: readonly TopCompany[];
  /** Đường dẫn mở ngăn kéo doanh nghiệp (tab Doanh nghiệp, `?companyId=`). */
  companyHref: (companyId: string) => string;
}

/**
 * Top 10 doanh nghiệp theo số lời mời ĐÃ GỬI trong khoảng (admin.md p6-08 §2.2). BE chỉ trả số đã gửi — kế hoạch còn muốn tỉ lệ quan tâm/từ chối
 * (tín hiệu spam) nhưng `GET /admin/recruiter/stats` chưa có, nên chưa có hai cột đó. Tên là liên kết thật sang ngăn kéo doanh nghiệp.
 */
const RecruiterTopCompanies = memo(function RecruiterTopCompanies({
  data,
  companyHref,
}: RecruiterTopCompaniesProps) {
  const columns = useMemo<TableColumn<TopCompany>[]>(
    () => [
      {
        key: 'name',
        header: 'Doanh nghiệp',
        width: 260,
        cell: (c) => (
          <Link className="block truncate text-link hover:underline" to={companyHref(c.companyId)}>
            {c.name}
          </Link>
        ),
      },
      {
        key: 'sent',
        header: 'Lời mời đã gửi',
        width: 140,
        align: 'right',
        cell: (c) => <span className="tabular-nums">{formatNumber(c.sent)}</span>,
      },
    ],
    [companyHref],
  );

  return (
    <Table
      columns={columns}
      data={[...data]}
      emptyMessage="Chưa có doanh nghiệp nào gửi lời mời trong khoảng đã chọn"
      pagination={false}
      rowKey={(c) => c.companyId}
    />
  );
});

export default RecruiterTopCompanies;
