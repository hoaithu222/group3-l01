import type { AxiosError } from 'axios';
import { memo } from 'react';

import { extractErrorCode } from '@/core/api/error.handler';
import { ConfirmWithReasonModal } from '@/shared/ui';

import { COMPANY_ACTION_META, RECRUITER_ERROR } from '../constants/recruiter.constants';
import { useCompanyAction } from '../service/recruiter.queries';
import type { CompanyAction } from '../types/recruiter.types';

export interface CompanyActionModalProps {
  company: { id: string; name: string };
  /** `null` = đóng. Giữ nguyên nhãn khi đóng để nội dung không nháy sang hành động khác lúc trượt ra. */
  action: CompanyAction | null;
  onClose: () => void;
}

/**
 * Hộp thoại lý do cho duyệt / từ chối / tạm ngưng / khôi phục (`recruiter:approve`): lý do ≥ 10 ký tự (khớp `reasonSchema` BE), tác động nêu rõ
 * (tạm ngưng nói số phận lời mời đang mở). Dùng chung ngăn kéo vận hành và khối báo cáo COMPANY của moderation.
 *
 * `RECR_009` = người khác vừa đổi trạng thái: hành động không bao giờ thành công được nữa nên ĐÓNG hộp thoại (hook đã làm mới dữ liệu,
 * interceptor đã toast); lỗi khác ném tiếp → hộp thoại giữ mở để thử lại.
 */
const CompanyActionModal = memo(function CompanyActionModal({
  company,
  action,
  onClose,
}: CompanyActionModalProps) {
  const mutation = useCompanyAction();
  const meta = action ? COMPANY_ACTION_META[action] : null;

  const handleConfirm = async (reason: string) => {
    if (!action) return;
    try {
      await mutation.mutateAsync({ companyId: company.id, action, reason });
    } catch (err) {
      if (extractErrorCode(err as AxiosError) !== RECRUITER_ERROR.invalidState) throw err;
    }
    onClose();
  };

  return (
    <ConfirmWithReasonModal
      confirmLabel={meta?.confirmLabel}
      confirmTone={meta?.danger ? 'danger' : 'primary'}
      impact={meta?.impact ?? ''}
      open={action !== null}
      title={meta ? `${meta.label} — ${company.name}` : 'Xử lý doanh nghiệp'}
      onConfirm={handleConfirm}
      onOpenChange={(next) => !next && onClose()}
    />
  );
});

export default CompanyActionModal;
