import { memo } from 'react';
import { useFormContext } from 'react-hook-form';

import { COLUMN_KIND_LABELS, COLUMN_KINDS } from '@/shared/constants/column-kinds';
import { Button, FieldArray, SelectField, Text, TextField } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import { COLUMN_TITLE_MAX, COLUMNS_MIN, NEW_COLUMN } from '../constants/pm.constants';
import type { DefaultColumnsFormValues } from '../schemas/default-columns.schema';

const KIND_OPTIONS = COLUMN_KINDS.map((kind) => ({ value: kind, label: COLUMN_KIND_LABELS[kind] }));

export interface DefaultColumnsEditorProps {
  /** Có `system-config:update` — thiếu thì chỉ đọc: không thêm/bớt/đổi thứ tự. */
  canEdit: boolean;
  /** Số cột tối đa (trần hiện hành `limits.board.columnsMax`). */
  maxColumns: number;
}

/**
 * Trình sửa danh sách cột mặc định (p3-02 admin.md §2.2): mỗi hàng là tên cột (`TextField`) + loại cột
 * (`SelectField`), thêm/bớt/đổi thứ tự bằng `FieldArray`. Phải nằm trong `<Form>`. Lỗi ở cấp mảng (số cột,
 * "đúng một cột Hoàn thành") hiện ngay dưới danh sách; lỗi từng ô do field kit2 tự hiện.
 */
const DefaultColumnsEditor = memo(function DefaultColumnsEditor({
  canEdit,
  maxColumns,
}: DefaultColumnsEditorProps) {
  const { formState } = useFormContext<DefaultColumnsFormValues>();
  const listError = formState.errors.columns?.root?.message ?? formState.errors.columns?.message;

  return (
    <FieldArray<DefaultColumnsFormValues, 'columns'> name="columns">
      {({ fields, append, remove, move }) => (
        <div className="flex flex-col gap-3">
          {fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-1 items-start gap-3 md:grid-cols-[1fr_14rem_auto]">
              <TextField
                label={`Tên cột ${index + 1}`}
                maxLength={COLUMN_TITLE_MAX}
                name={`columns.${index}.title`}
                required
              />
              <SelectField label={`Loại cột ${index + 1}`} name={`columns.${index}.kind`} options={KIND_OPTIONS} />
              {canEdit && (
                <div className="flex items-center gap-1 md:pt-6">
                  <Button
                    aria-label={`Đưa cột ${index + 1} lên trên`}
                    disabled={index === 0}
                    size="sm"
                    startIcon={<SystemIcon name="angle-up-outline" size={14} />}
                    variant="ghost"
                    onClick={() => move(index, index - 1)}
                  />
                  <Button
                    aria-label={`Đưa cột ${index + 1} xuống dưới`}
                    disabled={index === fields.length - 1}
                    size="sm"
                    startIcon={<SystemIcon name="angle-down-outline" size={14} />}
                    variant="ghost"
                    onClick={() => move(index, index + 1)}
                  />
                  <Button
                    aria-label={`Xoá cột ${index + 1}`}
                    disabled={fields.length <= COLUMNS_MIN}
                    size="sm"
                    skin="danger"
                    startIcon={<SystemIcon name="trash-outline" size={14} />}
                    variant="ghost"
                    onClick={() => remove(index)}
                  />
                </div>
              )}
            </div>
          ))}

          {listError && (
            <Text role="alert" size="small" skin="error">
              {listError}
            </Text>
          )}

          {canEdit && (
            <Button
              className="self-start"
              disabled={fields.length >= maxColumns}
              size="sm"
              startIcon={<SystemIcon name="plus-outline" size={14} />}
              variant="stroke"
              onClick={() => append({ ...NEW_COLUMN })}
            >
              Thêm cột
            </Button>
          )}
          <Text size="tiny" skin="muted">
            {`${COLUMNS_MIN}–${maxColumns} cột, đúng một cột loại "${COLUMN_KIND_LABELS.DONE}". Áp dụng cho bảng tạo MỚI; bảng đã có không đổi.`}
          </Text>
        </div>
      )}
    </FieldArray>
  );
});

export default DefaultColumnsEditor;
