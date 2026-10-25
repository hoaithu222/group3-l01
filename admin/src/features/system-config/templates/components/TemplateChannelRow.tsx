import { memo } from 'react';

import {
  Button,
  CheckboxField,
  SelectField,
  Surface,
  Text,
  TextField,
  type DropdownOption,
} from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import {
  CHANNEL_DESCRIPTION_MAX,
  CHANNEL_KEY_MAX,
  CHANNEL_NAME_MAX,
  POSTING_POLICY_OPTIONS,
  VISIBILITY_OPTIONS,
} from '../constants/templates.constants';

export interface TemplateChannelRowProps {
  /** Vị trí (0-based) trong mảng `channels`. */
  index: number;
  total: number;
  /** Có `system-config:update` — thiếu thì chỉ đọc: không đổi thứ tự/xoá. */
  canEdit: boolean;
  /** Không xoá được khi chỉ còn ngần này kênh. */
  minChannels: number;
  typeOptions: DropdownOption[];
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}

const CHECKBOX_LABEL = 'Chọn sẵn khi tạo nhóm';

/**
 * Một hàng kênh của mẫu (admin.md p5-04 §2.1): khoá, tên, mô tả, loại, hiển thị, chính sách đăng, chọn sẵn. Nhãn có số hàng
 * ("Khoá kênh 3") để hàng nào cũng có tên truy cập riêng. Phải nằm trong `<Form>` (field đọc RHF context).
 */
const TemplateChannelRow = memo(function TemplateChannelRow({
  index,
  total,
  canEdit,
  minChannels,
  typeOptions,
  onMove,
  onRemove,
}: TemplateChannelRowProps) {
  const n = index + 1;
  const field = (name: string) => `channels.${index}.${name}`;

  return (
    <Surface className="flex flex-col gap-3" padding="md" rounded>
      <div className="flex items-center justify-between gap-2">
        <Text size="small" weight="medium">{`Kênh ${n}`}</Text>
        {canEdit && (
          <div className="flex items-center gap-1">
            <Button
              aria-label={`Đưa kênh ${n} lên trên`}
              disabled={index === 0}
              size="sm"
              startIcon={<SystemIcon name="angle-up-outline" size={14} />}
              variant="ghost"
              onClick={() => onMove(index, index - 1)}
            />
            <Button
              aria-label={`Đưa kênh ${n} xuống dưới`}
              disabled={index === total - 1}
              size="sm"
              startIcon={<SystemIcon name="angle-down-outline" size={14} />}
              variant="ghost"
              onClick={() => onMove(index, index + 1)}
            />
            <Button
              aria-label={`Xoá kênh ${n}`}
              disabled={total <= minChannels}
              size="sm"
              skin="danger"
              startIcon={<SystemIcon name="trash-outline" size={14} />}
              variant="ghost"
              onClick={() => onRemove(index)}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <TextField
          label={`Khoá kênh ${n}`}
          maxLength={CHANNEL_KEY_MAX}
          name={field('key')}
          required
        />
        <TextField
          label={`Tên kênh ${n}`}
          maxLength={CHANNEL_NAME_MAX}
          name={field('name')}
          required
        />
      </div>
      <TextField
        label={`Mô tả kênh ${n}`}
        maxLength={CHANNEL_DESCRIPTION_MAX}
        name={field('description')}
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <SelectField label={`Loại kênh ${n}`} name={field('type')} options={typeOptions} />
        <SelectField
          label={`Hiển thị kênh ${n}`}
          name={field('visibility')}
          options={VISIBILITY_OPTIONS}
        />
        <SelectField
          label={`Chính sách đăng kênh ${n}`}
          name={field('postingPolicy')}
          options={POSTING_POLICY_OPTIONS}
        />
      </div>
      {/* Chế độ chỉ đọc của CheckboxField chỉ vẽ `label` (Có/Không), nên đổi bên nhãn theo chế độ. */}
      <CheckboxField
        checkboxLabel={canEdit ? CHECKBOX_LABEL : undefined}
        label={canEdit ? undefined : CHECKBOX_LABEL}
        name={field('defaultSelected')}
      />
    </Surface>
  );
});

export default TemplateChannelRow;
