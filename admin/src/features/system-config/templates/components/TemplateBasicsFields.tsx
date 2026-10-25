import { memo } from 'react';

import { TextareaField, TextField, ToggleField } from '@/shared/ui';

import { TEMPLATE_DESCRIPTION_MAX, TEMPLATE_NAME_MAX } from '../constants/templates.constants';

/** Tên, mô tả và bật/tắt của mẫu. Mã mẫu (`course`…) KHÔNG sửa được nên hiện ở tiêu đề ngăn kéo, không phải ô nhập. Trong `<Form>`. */
const TemplateBasicsFields = memo(function TemplateBasicsFields() {
  return (
    <div className="flex flex-col gap-3">
      <TextField label="Tên mẫu" maxLength={TEMPLATE_NAME_MAX} name="name" required />
      <TextareaField
        label="Mô tả"
        maxLength={TEMPLATE_DESCRIPTION_MAX}
        name="description"
        rows={3}
        showCount
      />
      <ToggleField
        description="Mẫu tắt không hiện ở bước chọn mẫu khi tạo nhóm và không áp được cho nhóm đã có."
        label="Trạng thái"
        name="isActive"
        toggleLabel="Bật mẫu"
      />
    </div>
  );
});

export default TemplateBasicsFields;
