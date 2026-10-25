import { memo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import { AuditTrailPanel } from '@/shared/widgets/audit-trail';
import { BoxPanel, Button, Callout, Skeleton, Toolbar } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import { BURNOUT_AUDIT_ACTIONS, BURNOUT_AUDIT_TARGET_TYPE } from '../constants/wellbeing.constants';
import { useBurnoutRules } from '../service/wellbeing.queries';
import BurnoutRuleFormModal from './BurnoutRuleFormModal';
import BurnoutRuleTable from './BurnoutRuleTable';
import BurnoutRulesSummary from './BurnoutRulesSummary';
import WellbeingLoadError from './WellbeingLoadError';

/**
 * Nhóm "Bộ luật đánh giá" (admin.md p7-03 §2.2): bộ luật cộng điểm theo hoạt động (không AI — D-13). `GET /admin/wellbeing/rules` cho mọi người có `gamification:view`;
 * nút "Sửa bộ luật" chỉ có khi có `gamification:update` (thiếu → chỉ đọc). Sửa hỏi lý do, gửi CAS `expectedVersion`, ghi nhật ký `wellbeing.rules-update` (hiện ngay bên dưới).
 * Đây là CẤU HÌNH chung, không phải dữ liệu của người nào — không có luật/ngoại lệ theo người dùng.
 */
const BurnoutRulesPanel = memo(function BurnoutRulesPanel() {
  const canUpdate = useAuthStore((s) => s.hasPermission('gamification', 'update'));
  const { data: rules, error, isLoading, refetch } = useBurnoutRules();
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <Callout
        description="Điểm nguy cơ = tổng điểm của các luật thoả điều kiện (tối đa 100), tính trên hoạt động của người ĐÃ tự bật theo dõi. Bộ luật mới chỉ áp dụng cho lần đánh giá kế tiếp, không tính lại quá khứ."
        intent="info"
        variant="ghost"
      />
      {error && !rules && (
        <WellbeingLoadError
          error={error}
          title="Không tải được bộ luật đánh giá"
          onRetry={() => void refetch()}
        />
      )}
      {isLoading && <Skeleton className="h-48 w-full" />}
      {rules && (
        <>
          <BurnoutRulesSummary rules={rules} />
          {canUpdate ? (
            <Toolbar
              right={
                <Button
                  size="sm"
                  startIcon={<SystemIcon name="pen-outline" size={14} />}
                  variant="stroke"
                  onClick={() => setEditing(true)}
                >
                  Sửa bộ luật
                </Button>
              }
            />
          ) : (
            <Callout
              description="Bạn chỉ có quyền xem bộ luật. Sửa luật cần quyền cập nhật Gamification."
              intent="neutral"
              variant="ghost"
            />
          )}
          <BurnoutRuleTable rules={rules.rules} />
        </>
      )}
      <BoxPanel border="hairline" className="h-auto" title="Nhật ký chỉnh sửa bộ luật">
        <div className="p-2">
          <AuditTrailPanel actions={BURNOUT_AUDIT_ACTIONS} targetType={BURNOUT_AUDIT_TARGET_TYPE} />
        </div>
      </BoxPanel>
      {editing && rules && <BurnoutRuleFormModal rules={rules} onClose={() => setEditing(false)} />}
    </div>
  );
});

export default BurnoutRulesPanel;
