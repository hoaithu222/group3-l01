import { z } from 'zod';

import { requiredText } from '@/shared/utils/validation/validators.utils';

import { resourceSchema, RESOURCES_MAX } from './resource.schema';

/**
 * Form GỘP của `LessonEditorPage` — một `<Form>` duy nhất trải trên các tab Thông tin · Nội dung · Tài
 * liệu · Luyện tập (Hình ảnh quản lý riêng qua `MediaManager`, không nằm trong form này — media có
 * endpoint/CAS riêng, be.md §4). Khớp `patchLessonSchema` (be.md §3) + `LIMITS.roadmap` (be.md §9:
 * `bodyMdMaxChars: 200_000`, `resourcesPerLessonMax: 60`, `practiceSetsMax: 10`).
 */
export const LESSON_TITLE_MAX = 200;
export const LESSON_SUMMARY_MAX = 2000;
export const LESSON_PREREQUISITES_MAX = 2000;
export const BODY_MD_MAX = 200_000;
export const PRACTICE_SETS_MAX = 10;

export const lessonFormSchema = z.object({
  title: requiredText('Tiêu đề buổi là bắt buộc').max(LESSON_TITLE_MAX, `Tối đa ${LESSON_TITLE_MAX} ký tự`),
  summary: z.string().trim().max(LESSON_SUMMARY_MAX, `Tóm tắt tối đa ${LESSON_SUMMARY_MAX} ký tự`),
  // Textarea số phút — giữ dạng chuỗi ở form (rỗng = không đặt), ép `number | null` lúc dựng payload.
  durationMinutes: z
    .string()
    .trim()
    .regex(/^\d*$/, 'Chỉ nhập số phút')
    .refine((v) => v === '' || Number(v) > 0, 'Thời lượng phải > 0'),
  prerequisites: z
    .string()
    .trim()
    .max(LESSON_PREREQUISITES_MAX, `Yêu cầu trước tối đa ${LESSON_PREREQUISITES_MAX} ký tự`),
  optional: z.boolean(),
  bodyMd: z.string().max(BODY_MD_MAX, `Nội dung tối đa ${BODY_MD_MAX.toLocaleString('vi-VN')} ký tự`),
  resources: z.array(resourceSchema).max(RESOURCES_MAX, `Tối đa ${RESOURCES_MAX} tài liệu`),
  practiceSetIds: z.array(z.string()).max(PRACTICE_SETS_MAX, `Tối đa ${PRACTICE_SETS_MAX} bộ luyện tập`),
});
export type LessonFormValues = z.infer<typeof lessonFormSchema>;

/** Form thu gọn cho "+ Thêm buổi" trong `PhasePanel` — chỉ hỏi tiêu đề, soạn nội dung sau trong `LessonEditorPage`. */
export const createLessonQuickSchema = z.object({
  title: requiredText('Tiêu đề buổi là bắt buộc').max(LESSON_TITLE_MAX, `Tối đa ${LESSON_TITLE_MAX} ký tự`),
});
export type CreateLessonQuickValues = z.infer<typeof createLessonQuickSchema>;
