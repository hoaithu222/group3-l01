import { memo } from 'react';

import { Button } from '@/shared/ui';

import { ACTIONS_BY_STATUS, COMPANY_ACTION_META } from '../constants/recruiter.constants';
import type { CompanyView } from '../types/company.types';
import type { CompanyAction } from '../types/recruiter.types';

export interface CompanyActionsProps {
  company: Pick<CompanyView, 'status'>;
  /** `recruiter:approve` — duyệt / từ chối / tạm ngưng / khôi phục. */
  canApprove: boolean;
  /** `recruiter:update` — chỉ `admin`; `manager` KHÔNG thấy "Đổi gói / hạn mức" và "Sửa thông tin". */
  canUpdate: boolean;
  onAction: (action: CompanyAction) => void;
  onTier: () => void;
  onEdit: () => void;
}

/**
 * Hàng nút hành động của ngăn kéo doanh nghiệp (admin.md p6-08 §2.1). Nút đổi trạng thái hiện theo TRẠNG THÁI hiện tại (máy trạng thái của BE:
 * chờ duyệt → duyệt/từ chối, đã duyệt → tạm ngưng, tạm ngưng → khôi phục, từ chối → chờ doanh nghiệp gửi lại) và theo QUYỀN — hành động không hợp lệ
 * hoặc thiếu quyền bị ẨN chứ không chờ 409/403. Bấm rồi mới nhập lý do (hộp thoại riêng).
 */
const CompanyActions = memo(function CompanyActions({
  company,
  canApprove,
  canUpdate,
  onAction,
  onTier,
  onEdit,
}: CompanyActionsProps) {
  const actions = canApprove ? ACTIONS_BY_STATUS[company.status] : [];
  if (actions.length === 0 && !canUpdate) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((action) => {
        const meta = COMPANY_ACTION_META[action];
        return (
          <Button
            key={action}
            size="sm"
            skin={meta.danger ? 'danger' : undefined}
            variant={action === 'approve' || action === 'reinstate' ? 'primary' : 'stroke'}
            onClick={() => onAction(action)}
          >
            {meta.label}
          </Button>
        );
      })}
      {canUpdate ? (
        <>
          <Button size="sm" variant="stroke" onClick={onTier}>
            Đổi gói / hạn mức
          </Button>
          <Button size="sm" variant="stroke" onClick={onEdit}>
            Sửa thông tin
          </Button>
        </>
      ) : null}
    </div>
  );
});

export default CompanyActions;
