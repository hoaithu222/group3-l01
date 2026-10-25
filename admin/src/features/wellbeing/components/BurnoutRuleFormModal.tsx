import { memo } from 'react';

import { Button, Callout, FormModal, NumberField, TextareaField } from '@/shared/ui';

import { REASON_LIMITS, RULE_LIMITS } from '../constants/wellbeing.constants';
import { useBurnoutRulesForm } from '../hooks';
import type { BurnoutRulesFormValues } from '../schemas/burnout-rules.schema';
import type { BurnoutRules } from '../types/wellbeing.types';
import BurnoutRuleFields from './BurnoutRuleFields';

export interface BurnoutRuleFormModalProps {
  /** Bộ luật đang lưu — form dựng từ bản này và gửi `expectedVersion` = `version` của nó. */
  rules: BurnoutRules;
  onClose: () => void;
}

/**
 * Form sửa bộ luật đánh giá (admin.md p7-03 §2.2): cửa sổ ngày, ngưỡng mức Trung bình/Cao (client chặn `cao ≤ trung bình` trước khi gửi), danh sách luật, lý do (10–500, vào nhật ký).
 * Nơi dùng CHỈ dựng modal khi đang mở. Lưu = `PUT /admin/wellbeing/rules` kèm `expectedVersion`; `RES_003` → đóng form và tải lại bộ luật. Có hiệu lực cho lần đánh giá KẾ TIẾP,
 * KHÔNG tính lại quá khứ. Nút "Về mặc định" (footer trái, `extraActions`) điền form bằng `rules.defaults` do BE trả kèm — KHÔNG tự lưu, vẫn phải bấm "Lưu bộ luật" (có lý do).
 */
const BurnoutRuleFormModal = memo(function BurnoutRuleFormModal({
  rules,
  onClose,
}: BurnoutRuleFormModalProps) {
  const { form, unchanged, submit, baseVersion, resetToDefaults } = useBurnoutRulesForm(rules);

  return (
    <FormModal<BurnoutRulesFormValues>
      confirmDisabled={unchanged}
      confirmLabel="Lưu bộ luật"
      extraActions={
        <Button
          size="md"
          type="button"
          variant="stroke"
          onClick={resetToDefaults}
        >
          Về mặc định
        </Button>
      }
      form={form}
      open
      scrollable
      size="lg"
      title="Sửa bộ luật đánh giá"
      onConfirm={submit}
      onOpenChange={(open) => !open && onClose()}
    >
      <Callout
        description={`Đang sửa từ phiên bản ${baseVersion}. Bộ luật mới áp dụng cho lần đánh giá kế tiếp; không tính lại quá khứ.`}
        intent="info"
        variant="ghost"
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <NumberField
          description="Mỗi luật chỉ nhìn được trong phạm vi này."
          label="Cửa sổ chấm điểm (ngày)"
          max={RULE_LIMITS.windowDaysMax}
          min={1}
          name="windowDays"
          required
        />
        <NumberField
          description="Từ mức điểm này trở lên là Trung bình."
          label="Ngưỡng mức Trung bình"
          max={RULE_LIMITS.mediumMax}
          min={1}
          name="levels.medium"
          required
        />
        <NumberField
          description="Phải lớn hơn mức Trung bình."
          label="Ngưỡng mức Cao"
          max={RULE_LIMITS.highMax}
          min={2}
          name="levels.high"
          required
        />
      </div>
      <BurnoutRuleFields />
      <TextareaField
        label="Lý do"
        maxLength={REASON_LIMITS.max}
        name="reason"
        placeholder="Ghi rõ lý do — sẽ lưu vào nhật ký quản trị"
        required
        rows={3}
        showCount
      />
    </FormModal>
  );
});

export default BurnoutRuleFormModal;
