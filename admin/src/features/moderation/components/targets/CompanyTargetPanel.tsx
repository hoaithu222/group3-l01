import { memo } from 'react';

import { useAuthStore } from '@/app/store';
import { isUnavailableError, useAdminCompany } from '@/features/recruiter';
import { BoxPanel, Button, Callout, EmptyState, Skeleton } from '@/shared/ui';

import type { AdminReportGroup } from '../../types/moderation.types';
import CompanyReportContext from './CompanyReportContext';
import CompanySuspendActions from './CompanySuspendActions';

export interface CompanyTargetPanelProps {
  /** Nhóm báo cáo có `targetType = COMPANY` — `targetId` là id doanh nghiệp. */
  group: AdminReportGroup;
}

/**
 * Phần riêng của báo cáo `COMPANY` trên trang chi tiết (p6-08, admin.md §2.3): ngữ cảnh doanh nghiệp → tạm ngưng/khôi phục. Đọc `GET /admin/companies/:id`
 * (cần `recruiter:view`, BE kiểm theo VAI HỆ THỐNG). Doanh nghiệp không còn (404) hoặc không được xem (403) → nói rõ lý do, KHÔNG "Thử lại"; mất mạng/5xx → Callout + "Thử lại".
 * Xem chi tiết doanh nghiệp KHÔNG phát sinh nhật ký (khác nội dung lời mời): đó là hồ sơ của một tổ chức, không phải nội dung riêng tư của cá nhân.
 */
const CompanyTargetPanel = memo(function CompanyTargetPanel({ group }: CompanyTargetPanelProps) {
  const canApprove = useAuthStore((s) => s.hasPermission('recruiter', 'approve'));
  const { data: detail, isLoading, isError, error, refetch } = useAdminCompany(group.targetId);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  if (isError || !detail) {
    if (isUnavailableError(error)) {
      return (
        <BoxPanel border="hairline" title="Doanh nghiệp bị báo cáo">
          <EmptyState
            description="Doanh nghiệp không còn tồn tại hoặc bạn không có quyền xem (cần quyền xem tuyển dụng), nên không thể hiển thị hồ sơ tại đây."
            size="sm"
            title="Doanh nghiệp không còn khả dụng"
          />
        </BoxPanel>
      );
    }
    return (
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={() => void refetch()}>
            Thử lại
          </Button>
        }
        intent="error"
        title="Không tải được doanh nghiệp"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <CompanyReportContext detail={detail} />
      <CompanySuspendActions canApprove={canApprove} company={detail.company} />
    </div>
  );
});

export default CompanyTargetPanel;
