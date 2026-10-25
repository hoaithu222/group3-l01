import { memo, useState } from 'react';

import { CompanyActionModal } from '@/features/recruiter';
import type { CompanyAction, CompanyStatus } from '@/features/recruiter';
import { BoxPanel, Button, Callout } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

export interface CompanySuspendActionsProps {
  company: { id: string; name: string; status: CompanyStatus };
  /** `recruiter:approve` — tạm ngưng/khôi phục; thiếu thì khối không hiện. */
  canApprove: boolean;
}

/**
 * Khối "Xử lý doanh nghiệp" (p6-08, admin.md §2.3): **Tạm ngưng doanh nghiệp** (đang được duyệt) hoặc **Khôi phục** (đang tạm ngưng) — DÙNG LẠI hộp thoại lý do
 * của phân hệ `recruiter` (`CompanyActionModal`: lý do ≥ 10 ký tự, nêu rõ tác động lên lời mời đang mở), không dựng bản thứ hai. BE tạm ngưng cũng đóng báo cáo mở
 * của doanh nghiệp (kết quả "Đã gỡ nội dung"). Doanh nghiệp chưa duyệt/đã bị từ chối → không có hành động nào ở đây (báo cáo chỉ nhận doanh nghiệp đã/đang hoạt động).
 * Cảnh cáo và Bỏ qua nằm ở khối "Quyết định" chung của trang.
 */
const CompanySuspendActions = memo(function CompanySuspendActions({
  company,
  canApprove,
}: CompanySuspendActionsProps) {
  const [action, setAction] = useState<CompanyAction | null>(null);
  if (!canApprove) return null;

  const next: CompanyAction | null =
    company.status === 'APPROVED' ? 'suspend' : company.status === 'SUSPENDED' ? 'reinstate' : null;

  return (
    <BoxPanel border="hairline" title="Xử lý doanh nghiệp">
      <div className="flex flex-col gap-2 p-3">
        {next ? (
          <div className="flex flex-wrap items-center gap-2">
            {next === 'suspend' ? (
              <Button
                size="sm"
                skin="danger"
                startIcon={<SystemIcon name="ban-outline" size={14} />}
                variant="stroke"
                onClick={() => setAction('suspend')}
              >
                Tạm ngưng doanh nghiệp
              </Button>
            ) : (
              <Button
                size="sm"
                startIcon={<SystemIcon name="arrow-rotate-left-outline" size={14} />}
                variant="stroke"
                onClick={() => setAction('reinstate')}
              >
                Khôi phục doanh nghiệp
              </Button>
            )}
          </div>
        ) : (
          <Callout
            description="Doanh nghiệp chưa được duyệt hoặc đã bị từ chối nên không có hành động tạm ngưng/khôi phục."
            intent="neutral"
          />
        )}
      </div>
      <CompanyActionModal action={action} company={company} onClose={() => setAction(null)} />
    </BoxPanel>
  );
});

export default CompanySuspendActions;
