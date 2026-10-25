import { memo } from 'react';
import { useFormContext } from 'react-hook-form';

import { Button, FieldArray, Text, type DropdownOption } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import { CHANNELS_MAX, CHANNELS_MIN, NEW_CHANNEL } from '../constants/templates.constants';
import type { TemplateFormValues } from '../schemas/template.schema';
import TemplateChannelRow from './TemplateChannelRow';

export interface TemplateChannelsFieldProps {
  /** Có `system-config:update` — thiếu thì chỉ đọc: không thêm/bớt/đổi thứ tự. */
  canEdit: boolean;
  typeOptions: DropdownOption[];
}

/**
 * Danh sách kênh của mẫu (`FieldArray`, 1–15 hàng): thêm/bớt/đổi thứ tự, mỗi hàng là `TemplateChannelRow`. Lỗi cấp mảng
 * (số kênh, và các lỗi BE báo về `channels`) hiện ngay dưới danh sách; lỗi khoá/tên trùng hiện ở đúng ô của hàng đó.
 * Phải nằm trong `<Form>`.
 */
const TemplateChannelsField = memo(function TemplateChannelsField({
  canEdit,
  typeOptions,
}: TemplateChannelsFieldProps) {
  const { formState } = useFormContext<TemplateFormValues>();
  const listError = formState.errors.channels?.root?.message ?? formState.errors.channels?.message;

  return (
    <FieldArray<TemplateFormValues, 'channels'> name="channels">
      {({ fields, append, remove, move }) => (
        <div className="flex flex-col gap-3">
          <Text
            size="small"
            weight="medium"
          >{`Kênh của mẫu (${fields.length}/${CHANNELS_MAX})`}</Text>

          {fields.map((field, index) => (
            <TemplateChannelRow
              key={field.id}
              canEdit={canEdit}
              index={index}
              minChannels={CHANNELS_MIN}
              total={fields.length}
              typeOptions={typeOptions}
              onMove={move}
              onRemove={remove}
            />
          ))}

          {listError && (
            <Text role="alert" size="small" skin="error">
              {listError}
            </Text>
          )}

          {canEdit && (
            <Button
              className="self-start"
              disabled={fields.length >= CHANNELS_MAX}
              size="sm"
              startIcon={<SystemIcon name="plus-outline" size={14} />}
              variant="stroke"
              onClick={() => append({ ...NEW_CHANNEL })}
            >
              Thêm kênh
            </Button>
          )}
          <Text size="tiny" skin="muted">
            {`${CHANNELS_MIN}–${CHANNELS_MAX} kênh, khoá và tên không trùng nhau. Không khai kênh "Chung" — kênh mặc định luôn tự tạo cùng nhóm.`}
          </Text>
        </div>
      )}
    </FieldArray>
  );
});

export default TemplateChannelsField;
