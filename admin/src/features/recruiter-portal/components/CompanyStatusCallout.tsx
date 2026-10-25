import { memo } from 'react';

import type { CompanyView } from '@/features/recruiter';
import { Button, Callout } from '@/shared/ui';

export interface CompanyStatusCalloutProps {
  company: Pick<CompanyView, 'status' | 'statusReason'>;
  /** OWNER mới sửa được hồ sơ và gửi duyệt lại. */
  isOwner: boolean;
  /** Chuyển tới tab Công ty (nơi sửa hồ sơ và "Gửi duyệt lại"). */
  onEditCompany: () => void;
}

/**
 * Banner trạng thái doanh nghiệp (admin.md p6-08 §2.4): CHỜ DUYỆT ("xác minh trong 1–2 ngày làm việc") · TỪ CHỐI (lý do + "Sửa và gửi lại") · TẠM NGƯNG (lý do + liên hệ hỗ trợ).
 * Khi doanh nghiệp chưa `APPROVED` thì banner này THAY toàn bộ nội dung tab Ứng viên và cổng KHÔNG gọi API ứng viên (BE trả `RECR_002`); `APPROVED` → không render gì.
 * Lý do là `statusReason` do vận hành nhập cho chính doanh nghiệp này (chỉ thành viên thấy) nên hiển thị nguyên văn dạng chữ.
 */
const CompanyStatusCallout = memo(function CompanyStatusCallout({
  company,
  isOwner,
  onEditCompany,
}: CompanyStatusCalloutProps) {
  const reason = company.statusReason ? `Lý do: ${company.statusReason}` : null;

  if (company.status === 'PENDING') {
    return (
      <Callout
        description="Chúng tôi sẽ xác minh hồ sơ trong 1–2 ngày làm việc. Bạn sẽ nhận thông báo khi có kết quả; trong lúc chờ, chưa thể tìm ứng viên hay gửi lời mời."
        icon="clock-bold"
        intent="info"
        title="Doanh nghiệp đang chờ duyệt"
      />
    );
  }

  if (company.status === 'REJECTED') {
    return (
      <Callout
        action={
          isOwner ? (
            <Button size="sm" variant="stroke" onClick={onEditCompany}>
              Sửa và gửi lại
            </Button>
          ) : undefined
        }
        description={
          <>
            {reason ?? 'Hồ sơ doanh nghiệp chưa được duyệt.'}
            {isOwner ? '' : ' Chỉ chủ sở hữu doanh nghiệp sửa và gửi lại được hồ sơ.'}
          </>
        }
        intent="error"
        title="Hồ sơ doanh nghiệp chưa được duyệt"
      />
    );
  }

  if (company.status === 'SUSPENDED') {
    return (
      <Callout
        description={
          <>
            {reason ? `${reason}. ` : ''}
            Các lời mời đang mở chuyển sang chỉ đọc. Liên hệ đội hỗ trợ để được xem xét lại.
          </>
        }
        icon="ban-bold"
        intent="warning"
        title="Doanh nghiệp đang tạm ngưng"
      />
    );
  }

  return null;
});

export default CompanyStatusCallout;
