import { memo, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { BoxPanel, Button, Callout, ConfirmWithReasonModal } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import {
  ADMIN_ACTION_META,
  REPORT_RESOLUTION_LABEL,
  REPORT_TARGET_TYPE_LABEL,
} from '../constants/moderation.constants';
import { useReportAction } from '../service/moderation.queries';
import type { AdminReportAction, AdminReportGroup } from '../types/moderation.types';
import { availableActions } from '../utils/report-actions';
import { tolerateAlreadyHandled } from '../utils/report-errors';

export interface ReportDecisionBarProps {
  group: AdminReportGroup;
  /** Báo cáo đại diện (`:id` của trang) — `:reportId` của `PATCH`. */
  reportId: string;
  /** `moderation:update`. */
  canUpdate: boolean;
  /** `user:update` — cần thêm cho "Khoá tài khoản". */
  canLockUser: boolean;
  /** Đường quay lại hàng đợi (giữ bộ lọc) — hiện khi nhóm đã xử lý xong. */
  backTo: string;
}

/**
 * Khối "Quyết định" (admin.md p1-08 §2.2). Nút hiện theo LOẠI ĐÍCH và QUYỀN — hành động không hợp
 * loại đích/thiếu quyền bị ẨN chứ không chờ 403/400 (`availableActions`). Mọi hành động đều đi qua
 * `ConfirmWithReasonModal` (lý do ≥ 10 ký tự, khớp `reasonSchema` của BE) và đóng CẢ NHÓM báo cáo.
 * Nhóm đã xử lý → chỉ đọc, kèm đường về hàng đợi.
 */
const ReportDecisionBar = memo(function ReportDecisionBar({
  group,
  reportId,
  canUpdate,
  canLockUser,
  backTo,
}: ReportDecisionBarProps) {
  const [action, setAction] = useState<AdminReportAction | null>(null);
  const reportAction = useReportAction();
  const actions = useMemo(
    () => availableActions(group, { canUpdate, canLockUser }),
    [group, canUpdate, canLockUser],
  );
  const meta = action ? ADMIN_ACTION_META[action] : null;

  let body: ReactNode;
  if (group.status !== 'OPEN') {
    body = (
      <Callout
        action={
          <Button asChild size="sm" variant="stroke">
            <Link to={backTo}>Quay lại hàng đợi</Link>
          </Button>
        }
        description={
          group.resolution
            ? `Kết quả: ${REPORT_RESOLUTION_LABEL[group.resolution]}. Đã ghi nhật ký.`
            : 'Đã ghi nhật ký.'
        }
        intent="success"
        title="Báo cáo đã được xử lý"
      />
    );
  } else if (actions.length === 0) {
    body = (
      <Callout
        description="Tài khoản của bạn chỉ có quyền xem báo cáo, không có quyền xử lý."
        intent="neutral"
      />
    );
  } else {
    body = (
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((key) => {
          const item = ADMIN_ACTION_META[key];
          return (
            <Button
              key={key}
              size="sm"
              skin={item.danger ? 'danger' : undefined}
              startIcon={<SystemIcon name={item.icon} size={14} />}
              variant={key === 'DISMISS' ? 'secondary' : 'stroke'}
              onClick={() => setAction(key)}
            >
              {item.label}
            </Button>
          );
        })}
      </div>
    );
  }

  return (
    <BoxPanel border="hairline" title="Quyết định">
      <div className="p-3">{body}</div>
      <ConfirmWithReasonModal
        confirmLabel={meta?.confirmLabel}
        confirmTone={meta?.danger ? 'danger' : 'primary'}
        impact={meta ? `${meta.impact} Mọi báo cáo đang mở cùng đích này sẽ được đóng.` : ''}
        open={action !== null}
        title={
          meta ? `${meta.label} — ${REPORT_TARGET_TYPE_LABEL[group.targetType]}` : 'Xử lý báo cáo'
        }
        onConfirm={(reason) =>
          tolerateAlreadyHandled(() =>
            action ? reportAction.mutateAsync({ reportId, action, reason }) : Promise.resolve(),
          )
        }
        onOpenChange={(next) => !next && setAction(null)}
      />
    </BoxPanel>
  );
});

export default ReportDecisionBar;
