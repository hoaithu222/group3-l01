import { useWatch, type Control, type UseFormSetFocus } from 'react-hook-form';

import { Card } from '@/shared/ui/card';
import { FormInput } from '@/shared/ui/input';

import type { StudyLimits } from '../../constants/study.constants';
import type { SetFormValues } from '../../schemas/study.schemas';

export interface SetFormInfoFieldsProps {
  /** Tạo mới (tiêu đề còn trống) ⇒ đặt con trỏ vào ô tiêu đề ngay khi mở màn; sửa thì không tự bật bàn phím. */
  autoFocusTitle?: boolean;
  control: Control<SetFormValues>;
  limits: StudyLimits;
  /** Bấm "Tiếp" ở tiêu đề nhảy sang mô tả — `form.setFocus` dùng đúng ref `FormInput` đã gắn sẵn. */
  setFocus: UseFormSetFocus<SetFormValues>;
}

/**
 * Nhóm "Thông tin" của form bộ học: tiêu đề + mô tả, mỗi ô có BỘ ĐẾM ký tự ("12/120") ở góc phải nhãn. Lỗi Zod hiện ngay dưới ô sau
 * khi rời ô (`onTouched`, xem `form-validation.md`). `useWatch` ở đây (không ở `SetForm`) để mỗi phím gõ chỉ vẽ lại hai ô này chứ không
 * vẽ lại cả form cùng khối chọn phạm vi/ảnh bìa.
 *
 * ⚠️ `maxLength` chặn gõ quá trần nên bộ đếm không bao giờ vượt — nó là chỉ dẫn "còn bao nhiêu chỗ", không phải cảnh báo lỗi.
 */
export function SetFormInfoFields({
  autoFocusTitle = false,
  control,
  limits,
  setFocus,
}: SetFormInfoFieldsProps) {
  const title = useWatch({ control, name: 'title' }) ?? '';
  const description = useWatch({ control, name: 'description' }) ?? '';

  return (
    <Card>
      <FormInput<SetFormValues>
        autoCapitalize="sentences"
        autoFocus={autoFocusTitle}
        control={control}
        hint={`${title.length}/${limits.setTitleMax}`}
        label="Tiêu đề"
        maxLength={limits.setTitleMax}
        name="title"
        placeholder="Ví dụ: Từ vựng IELTS chủ đề Môi trường"
        required
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => setFocus('description')}
      />
      <FormInput<SetFormValues>
        control={control}
        hint={`${description.length}/${limits.setDescriptionMax}`}
        label="Mô tả"
        maxLength={limits.setDescriptionMax}
        multiline
        name="description"
        placeholder="Bộ này dành cho ai, học gì? (không bắt buộc)"
      />
    </Card>
  );
}
