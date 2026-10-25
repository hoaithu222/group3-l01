import { memo } from 'react';
import { useFormContext } from 'react-hook-form';

import { Button, FieldArray, NumberField, SelectField, Text, TextField } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import {
  AGGREGATE_OPTIONS,
  METRIC_OPTIONS,
  OP_OPTIONS,
  RULE_LIMITS,
} from '../constants/wellbeing.constants';
import type { BurnoutRulesFormValues } from '../schemas/burnout-rules.schema';
import { canAddRule, newRuleRow } from '../utils/rules-form.utils';

/**
 * Danh sách luật trong form sửa bộ luật (admin.md p7-03 §2.2): mỗi luật là tên + chỉ số + cách tổng hợp + phép so sánh + số ngày + ngưỡng + điểm, thêm/bớt bằng `FieldArray`.
 * Phải nằm trong `<FormModal form>`. Mã luật (`ruleId`) không cho sửa — giữ cho lịch sử đánh giá (`factors`) trỏ đúng luật; luật mới được cấp mã tự động.
 * Lỗi cấp mảng (số luật) hiện dưới danh sách; lỗi từng ô do field kit2 tự hiện.
 */
const BurnoutRuleFields = memo(function BurnoutRuleFields() {
  const { formState, getValues } = useFormContext<BurnoutRulesFormValues>();
  const listError = formState.errors.rules?.root?.message ?? formState.errors.rules?.message;

  return (
    <FieldArray<BurnoutRulesFormValues, 'rules'> name="rules">
      {({ fields, append, remove }) => (
        <div className="flex flex-col gap-3">
          {fields.map((field, index) => {
            const n = index + 1;
            return (
              <div key={field.id} className="flex flex-col gap-3 border border-border-1 p-3">
                <div className="flex items-start gap-2">
                  <TextField
                    className="flex-1"
                    description={`Mã: ${field.ruleId}`}
                    label={`Tên luật ${n}`}
                    maxLength={RULE_LIMITS.labelMax}
                    name={`rules.${index}.label`}
                    required
                  />
                  <Button
                    aria-label={`Xoá luật ${n}`}
                    className="mt-6"
                    disabled={fields.length <= 1}
                    size="sm"
                    skin="danger"
                    startIcon={<SystemIcon name="trash-outline" size={14} />}
                    variant="ghost"
                    onClick={() => remove(index)}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <SelectField
                    label={`Chỉ số (luật ${n})`}
                    name={`rules.${index}.metric`}
                    options={METRIC_OPTIONS}
                    required
                  />
                  <SelectField
                    label={`Cách tổng hợp (luật ${n})`}
                    name={`rules.${index}.aggregate`}
                    options={AGGREGATE_OPTIONS}
                    required
                  />
                  <SelectField
                    label={`Phép so sánh (luật ${n})`}
                    name={`rules.${index}.op`}
                    options={OP_OPTIONS}
                    required
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <NumberField
                    label={`Số ngày (luật ${n})`}
                    max={RULE_LIMITS.windowDaysMax}
                    min={1}
                    name={`rules.${index}.days`}
                    required
                  />
                  <NumberField
                    label={`Ngưỡng (luật ${n})`}
                    max={RULE_LIMITS.thresholdMax}
                    min={0}
                    name={`rules.${index}.threshold`}
                    required
                  />
                  <NumberField
                    label={`Điểm cộng (luật ${n})`}
                    max={RULE_LIMITS.pointsMax}
                    min={1}
                    name={`rules.${index}.points`}
                    required
                  />
                </div>
              </div>
            );
          })}

          {listError && (
            <Text role="alert" size="small" skin="error">
              {listError}
            </Text>
          )}

          <Button
            className="self-start"
            disabled={!canAddRule(fields.length)}
            size="sm"
            startIcon={<SystemIcon name="plus-outline" size={14} />}
            variant="stroke"
            onClick={() =>
              append(
                newRuleRow(
                  getValues('rules').map((r) => r.ruleId),
                  getValues('windowDays'),
                ),
              )
            }
          >
            Thêm luật
          </Button>
          <Text size="tiny" skin="muted">
            {`1–${RULE_LIMITS.rulesMax} luật. Tổng điểm của các luật thoả điều kiện, tối đa 100, quyết định mức Thấp / Trung bình / Cao.`}
          </Text>
        </div>
      )}
    </FieldArray>
  );
});

export default BurnoutRuleFields;
