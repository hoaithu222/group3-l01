import { memo } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import { Badge, Button, NumberField, SelectField, ToggleField } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import { enumOptionLabel } from '../constants/enum-labels';
import type { ConfigFieldMeta } from '../types/system-config.types';
import {
  fieldHint,
  fieldUnitSuffix,
  formKeyOf,
  isNumericField,
  toDisplay,
} from '../utils/config-fields';
import {
  defaultFormValue,
  type ConfigFormValue,
  type ConfigFormValues,
} from '../utils/config-form';

export interface ConfigFieldRowProps {
  field: ConfigFieldMeta;
  form: UseFormReturn<ConfigFormValues>;
  /** Giá trị ô đang nhập (dạng form) — quyết định nhãn "Đã tuỳ chỉnh". */
  current: ConfigFormValue | undefined;
  canEdit: boolean;
}

/**
 * Một ô của nhóm cấu hình, theo kind: số (`NumberField` kẹp `floor`/`ceil`),
 * bật/tắt (`ToggleField`), chọn (`SelectField`). Kèm nhãn "Đã tuỳ chỉnh" khi
 * khác mặc định và nút "Về mặc định" (= bỏ khỏi override khi lưu).
 */
const ConfigFieldRow = memo(function ConfigFieldRow({
  field,
  form,
  current,
  canEdit,
}: ConfigFieldRowProps) {
  const defaultShown = defaultFormValue(field);
  const name = formKeyOf(field.path);
  const custom = (current ?? defaultShown) !== defaultShown;
  const suffix = fieldUnitSuffix(field);
  // BE đôi khi đã ghi đơn vị vào nhãn (`Khoá sau khi chạy nền (giây)`) — không thêm lần nữa.
  const label =
    suffix && !field.label.includes(`(${suffix})`) ? `${field.label} (${suffix})` : field.label;
  const hint = fieldHint(field);

  return (
    <div className="flex flex-col gap-1">
      {isNumericField(field) ? (
        <NumberField
          description={hint}
          disabled={!canEdit}
          label={label}
          max={field.ceil !== undefined ? toDisplay(field, field.ceil) : undefined}
          min={field.floor !== undefined ? toDisplay(field, field.floor) : undefined}
          name={name}
        />
      ) : field.kind === 'bool' ? (
        <ToggleField description={hint} disabled={!canEdit} label={label} name={name} />
      ) : (
        <SelectField
          description={hint}
          disabled={!canEdit}
          label={label}
          name={name}
          options={(field.options ?? []).map((o) => ({ value: o, label: enumOptionLabel(o) }))}
        />
      )}
      <div className="flex items-center gap-2">
        {custom && (
          <Badge color="info" size="sm" variant="tinted">
            Đã tuỳ chỉnh
          </Badge>
        )}
        {canEdit && custom && (
          <Button
            aria-label={`Về mặc định — ${field.label}`}
            size="sm"
            startIcon={<SystemIcon name="arrow-rotate-left-outline" size={14} />}
            variant="ghost"
            onClick={() =>
              form.setValue(name, defaultShown, { shouldDirty: true, shouldValidate: true })
            }
          >
            Về mặc định
          </Button>
        )}
      </div>
    </div>
  );
});

export default ConfigFieldRow;
