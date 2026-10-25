import { memo, useMemo } from 'react';
import { useWatch } from 'react-hook-form';

import { Form, Text, useZodForm } from '@/shared/ui';

import JsonConfigCard from '../../components/JsonConfigCard';
import { useJsonConfigField } from '../../hooks/useJsonConfigField';
import type { SystemConfigItem } from '../../types/system-config.types';
import {
  buildDefaultColumnsSchema,
  type DefaultColumnsFormValues,
} from '../schemas/default-columns.schema';
import { columnsPatch, summarizeColumns, toColumnsForm } from '../utils/default-columns';
import DefaultColumnsEditor from './DefaultColumnsEditor';

export interface DefaultColumnsCardProps {
  /** Khoá `pm` của registry (field json `defaultColumns`). */
  item: SystemConfigItem;
  /** Trần số cột hiện hành (`limits.board.columnsMax`). */
  maxColumns: number;
  /** Có `system-config:update`. */
  canEdit: boolean;
  /** Tải lại danh sách và trả bản mới của khoá này. */
  onReload: (key: string) => Promise<SystemConfigItem | undefined>;
}

/**
 * Thẻ "Cột mặc định khi tạo bảng" (`pm.defaultColumns`, p3-02 admin.md §2.2) — trình sửa có cấu trúc cho field
 * `json`. Lưu = kiểm Zod (2–N cột, đúng 1 cột Hoàn thành) → hộp thoại lý do kèm so sánh trước/sau →
 * `PUT /admin/system-config/pm` với `expectedVersion`; 409 → banner tải lại (xem `useJsonConfigField`).
 */
const DefaultColumnsCard = memo(function DefaultColumnsCard({
  item,
  maxColumns,
  canEdit,
  onReload,
}: DefaultColumnsCardProps) {
  const schema = useMemo(() => buildDefaultColumnsSchema(maxColumns), [maxColumns]);
  // `values` + keepDirtyValues: form THEO server khi chưa sửa; hàng đang gõ dở được giữ nguyên.
  const serverValues = useMemo(() => toColumnsForm(item), [item]);
  const form = useZodForm<DefaultColumnsFormValues>(schema, {
    defaultValues: serverValues,
    values: serverValues,
    resetOptions: { keepDirtyValues: true },
  });
  const columns = useWatch({ control: form.control, name: 'columns' });

  const g = useJsonConfigField({
    item,
    isDirty: form.formState.isDirty,
    onReload,
    onAdopt: (fresh) => form.reset(toColumnsForm(fresh)),
  });

  return (
    <JsonConfigCard
      canEdit={canEdit}
      description="Mẫu cột dùng khi nhóm tạo bảng mới — bảng đã có không đổi."
      g={g}
      isDirty={form.formState.isDirty}
      item={item}
      saveImpact={
        <div className="flex flex-col gap-1">
          <Text size="small" skin="muted">
            Trước: {summarizeColumns(serverValues.columns)}
          </Text>
          <Text size="small">Sau: {summarizeColumns(columns ?? [])}</Text>
        </div>
      }
      title="Cột mặc định khi tạo bảng"
      onSaveClick={form.handleSubmit((values) => g.requestSave(columnsPatch(values)))}
    >
      <Form form={form} readOnly={!canEdit} onSubmit={() => undefined}>
        <DefaultColumnsEditor canEdit={canEdit} maxColumns={maxColumns} />
      </Form>
    </JsonConfigCard>
  );
});

export default DefaultColumnsCard;
