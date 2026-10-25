import { memo, useMemo } from 'react';
import { useWatch } from 'react-hook-form';

import { useAuthStore } from '@/app/store';
import { Form, Text, useZodForm } from '@/shared/ui';

import JsonConfigCard from '../../components/JsonConfigCard';
import { useJsonConfigField } from '../../hooks/useJsonConfigField';
import type { SystemConfigItem } from '../../types/system-config.types';
import {
  quotaOverridesSchema,
  type QuotaOverridesFormValues,
} from '../schemas/quota-overrides.schema';
import {
  describeOverrideChange,
  overridesPatch,
  toOverridesForm,
} from '../utils/quota-overrides';
import QuotaOverridesEditor from './QuotaOverridesEditor';

export interface QuotaOverridesCardProps {
  /** Khoá `resource` của registry (field json `quotaOverrides`). */
  item: SystemConfigItem;
  /** Có `system-config:update`. */
  canEdit: boolean;
  /** Tải lại danh sách và trả bản mới của khoá này. */
  onReload: (key: string) => Promise<SystemConfigItem | undefined>;
}

/**
 * Thẻ "Hạn mức riêng theo nhóm" (`resource.quotaOverrides`, p3-01) — trình sửa cho field `json`: đổi giá trị
 * hoặc bỏ hạn mức riêng của các nhóm ĐÃ có. Lưu = kiểm Zod (0,5–100 GiB) → hộp thoại lý do kèm tóm tắt thay
 * đổi → `PUT /admin/system-config/resource` với `expectedVersion`; 409 → banner tải lại.
 */
const QuotaOverridesCard = memo(function QuotaOverridesCard({
  item,
  canEdit,
  onReload,
}: QuotaOverridesCardProps) {
  const canViewWorkspace = useAuthStore((s) => s.hasPermission)('workspace', 'view');
  const serverValues = useMemo(() => toOverridesForm(item), [item]);
  const form = useZodForm<QuotaOverridesFormValues>(quotaOverridesSchema, {
    defaultValues: serverValues,
    values: serverValues,
    resetOptions: { keepDirtyValues: true },
  });
  const overrides = useWatch({ control: form.control, name: 'overrides' });

  const g = useJsonConfigField({
    item,
    isDirty: form.formState.isDirty,
    onReload,
    onAdopt: (fresh) => form.reset(toOverridesForm(fresh)),
  });

  return (
    <JsonConfigCard
      canEdit={canEdit}
      description="Nhóm có hạn mức riêng dùng giá trị này thay cho hạn mức mặc định."
      g={g}
      isDirty={form.formState.isDirty}
      item={item}
      saveImpact={
        <Text size="small">{describeOverrideChange(serverValues.overrides, overrides ?? [])}</Text>
      }
      onSaveClick={form.handleSubmit((values) => g.requestSave(overridesPatch(values)))}
    >
      <Form form={form} readOnly={!canEdit} onSubmit={() => undefined}>
        <QuotaOverridesEditor canEdit={canEdit} canViewWorkspace={canViewWorkspace} />
      </Form>
    </JsonConfigCard>
  );
});

export default QuotaOverridesCard;
