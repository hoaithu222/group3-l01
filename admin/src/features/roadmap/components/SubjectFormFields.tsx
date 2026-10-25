import { ColorPickerField, FileField, MultiSelectField, SelectField, TextareaField, TextField } from '@/shared/ui';

import { useRoadmapImageUpload } from '../hooks/useRoadmapImageUpload';
import {
  LESSON_LABEL_OPTIONS,
  STUDY_DAY_OPTIONS,
  SUBJECT_CATEGORY_SUGGESTIONS,
  SUBJECT_DESCRIPTION_MAX,
  SUBJECT_TITLE_MAX,
  UNLOCK_MODE_OPTIONS,
} from '../schemas/subject.schema';

const CATEGORY_OPTIONS = SUBJECT_CATEGORY_SUGGESTIONS.map((c) => ({ value: c, label: c }));

export interface SubjectFormFieldsProps {
  /** `coverAssetId` CHỈ có ở `patchSubjectSchema` (be.md §3) — ẩn field ảnh bìa lúc tạo mới. */
  isEditing: boolean;
}

/**
 * Trường dùng CHUNG cho `SubjectCreatePage` (trang riêng) và `SubjectFormModal` (sửa, mở từ
 * `SubjectDetailPage`) — tránh chép hai lần 9 field. Đọc `bodyMd`/mọi field qua ambient RHF context của
 * `<Form>`/`<FormModal>` bao ngoài, không nhận `form` qua props (mẫu field kit2).
 */
export default function SubjectFormFields({ isEditing }: SubjectFormFieldsProps) {
  const cover = useRoadmapImageUpload();

  return (
    <>
      <TextField
        description={
          isEditing ? 'Không đổi được sau khi tạo.' : 'a-z, 0-9, dấu gạch ngang (3–40) — dùng trong URL.'
        }
        disabled={isEditing}
        label="Slug"
        name="slug"
        required
      />
      <TextField label="Tiêu đề" maxLength={SUBJECT_TITLE_MAX} name="title" required />
      <TextareaField label="Mô tả" maxLength={SUBJECT_DESCRIPTION_MAX} name="description" rows={3} showCount />
      <SelectField creatable label="Danh mục" name="category" options={CATEGORY_OPTIONS} searchable />
      <ColorPickerField label="Màu" name="color" />
      <TextField
        description="Emoji hoặc icon ngắn hiển thị cạnh tên môn."
        label="Icon"
        maxLength={40}
        name="icon"
      />
      {isEditing && (
        <FileField
          accept="image/jpeg,image/png,image/webp"
          label="Ảnh bìa"
          maxSize={5}
          name="cover"
          onUpload={cover.onUpload}
        />
      )}
      <SelectField label="Nhãn đơn vị buổi học" name="lessonLabel" options={LESSON_LABEL_OPTIONS} />
      <MultiSelectField label="Thứ học mặc định" name="defaultStudyDays" options={STUDY_DAY_OPTIONS} />
      <SelectField label="Chế độ mở khoá" name="unlockMode" options={UNLOCK_MODE_OPTIONS} />
    </>
  );
}
