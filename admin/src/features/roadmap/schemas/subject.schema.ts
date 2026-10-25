import { z } from 'zod';

import { requiredText } from '@/shared/utils/validation/validators.utils';

/** Khớp `createSubjectSchema`/`patchSubjectSchema` (be.md §3). Zod 4 (KHÔNG phải v3 của `be/`). */
export const SUBJECT_TITLE_MAX = 120;
export const SUBJECT_DESCRIPTION_MAX = 2000;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const DEFAULT_COLOR = '#06B6D4';

/** Ảnh bìa — value của `FileField` là id asset (`url` = id, xem `useRoadmapImageUpload`), CHỈ dùng khi sửa (patch). */
const coverSchema = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    url: z.string().regex(/^[a-f0-9]{24}$/i, 'Ảnh chưa tải xong, hãy đợi hoặc chọn lại'),
    size: z.number().optional(),
  })
  .nullable();

export const subjectFormSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{3,40}$/, 'Slug 3–40 ký tự a-z, 0-9, dấu gạch ngang'),
  title: requiredText('Tiêu đề là bắt buộc').max(SUBJECT_TITLE_MAX, `Tối đa ${SUBJECT_TITLE_MAX} ký tự`),
  description: z
    .string()
    .trim()
    .max(SUBJECT_DESCRIPTION_MAX, `Mô tả tối đa ${SUBJECT_DESCRIPTION_MAX} ký tự`),
  category: requiredText('Chọn hoặc nhập danh mục').max(60, 'Danh mục tối đa 60 ký tự'),
  // ColorPickerField luôn có giá trị hex hợp lệ (fallback cyan khi trống) — không mô hình `null` ở form,
  // dù `RoadmapSubject.color` phía BE cho phép null.
  color: z.string().regex(HEX_RE, 'Màu không hợp lệ').default(DEFAULT_COLOR),
  icon: z.string().trim().max(40, 'Icon tối đa 40 ký tự'),
  lessonLabel: z.enum(['Buổi', 'Ngày', 'Bài']),
  // `MultiSelectField` lưu giá trị dạng `string[]` (khớp `MultiSelectOption.value`) — ép về `number[]`
  // lúc dựng payload (`toCreatePayload`/`toPatchPayload`), không ở schema form. 1..7 phần tử, "1".."7", không trùng.
  defaultStudyDays: z
    .array(z.enum(['1', '2', '3', '4', '5', '6', '7']))
    .min(1, 'Chọn ít nhất 1 thứ học trong tuần')
    .max(7)
    .refine((days) => new Set(days).size === days.length, 'Không chọn trùng thứ học'),
  unlockMode: z.enum(['FREE', 'SEQUENTIAL']),
  /** CHỈ gửi khi sửa (`PatchSubjectPayload.coverAssetId`) — `SubjectFormFields` ẩn field này lúc tạo mới. */
  cover: coverSchema,
});
export type SubjectFormValues = z.infer<typeof subjectFormSchema>;

export const SUBJECT_CATEGORY_SUGGESTIONS = [
  'Lập trình',
  'Ngoại ngữ',
  'Kỹ năng mềm',
  'Chứng chỉ',
  'Khác',
] as const;

export const LESSON_LABEL_OPTIONS = [
  { value: 'Buổi', label: 'Buổi' },
  { value: 'Ngày', label: 'Ngày' },
  { value: 'Bài', label: 'Bài' },
];

export const UNLOCK_MODE_OPTIONS = [
  { value: 'FREE', label: 'Tự do (xem trước, gợi ý học theo thứ tự)' },
  { value: 'SEQUENTIAL', label: 'Tuần tự (phải xong buổi trước mới mở buổi sau)' },
];

/** Thứ 2 → Chủ nhật, giá trị 1–7 khớp `defaultStudyDays` (be.md §3). */
export const STUDY_DAY_OPTIONS = [
  { value: '1', label: 'Thứ 2' },
  { value: '2', label: 'Thứ 3' },
  { value: '3', label: 'Thứ 4' },
  { value: '4', label: 'Thứ 5' },
  { value: '5', label: 'Thứ 6' },
  { value: '6', label: 'Thứ 7' },
  { value: '7', label: 'Chủ nhật' },
];
