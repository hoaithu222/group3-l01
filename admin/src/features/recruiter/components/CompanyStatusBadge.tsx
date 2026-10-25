import { memo } from 'react';

import { Badge } from '@/shared/ui';

import { COMPANY_STATUS_META } from '../constants/recruiter.constants';
import type { CompanyStatus } from '../types/company.types';

export interface CompanyStatusBadgeProps {
  status: CompanyStatus;
}

/** Trạng thái doanh nghiệp: màu + CHỮ (Chờ duyệt / Đã duyệt / Từ chối / Tạm ngưng) — không chỉ dựa vào màu. Dùng chung vận hành và cổng HR. */
const CompanyStatusBadge = memo(function CompanyStatusBadge({ status }: CompanyStatusBadgeProps) {
  const meta = COMPANY_STATUS_META[status];
  return (
    <Badge color={meta.color} size="sm" variant="tinted">
      {meta.label}
    </Badge>
  );
});

export default CompanyStatusBadge;
