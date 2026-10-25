import { TextareaField, TextField, ToggleField } from '@/shared/ui';

import { LESSON_PREREQUISITES_MAX, LESSON_SUMMARY_MAX, LESSON_TITLE_MAX } from '../schemas/lesson.schema';

/**
 * Tab "Thông tin" của `LessonEditorPage` (admin.md §2) — field đọc ambient RHF context của `<Form>` bao
 * ngoài (mẫu field kit2), phần thuộc form gộp `lesson.schema.ts`. `durationMinutes` giữ dạng chuỗi ở form
 * (rỗng = không đặt) — ép `number | null` lúc dựng `PatchLessonPayload` (`utils/lesson-form.utils.ts`).
 */
export default function LessonInfoForm() {
  return (
    <div className="flex flex-col gap-4">
      <TextField label="Tiêu đề buổi" maxLength={LESSON_TITLE_MAX} name="title" required />
      <TextareaField label="Tóm tắt" maxLength={LESSON_SUMMARY_MAX} name="summary" rows={2} showCount />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          description="Vd 180 (≈ 3 tiếng)."
          label="Thời lượng (phút)"
          name="durationMinutes"
          placeholder="180"
        />
        <ToggleField
          description="Không tính vào mẫu số % hoàn thành bắt buộc của môn."
          label="Buổi tuỳ chọn"
          name="optional"
          toggleLabel="Đánh dấu tuỳ chọn"
        />
      </div>
      <TextareaField
        label="Yêu cầu trước"
        maxLength={LESSON_PREREQUISITES_MAX}
        name="prerequisites"
        rows={2}
        showCount
      />
    </div>
  );
}
