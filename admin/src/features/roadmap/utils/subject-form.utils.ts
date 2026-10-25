import type { SubjectFormValues } from '../schemas/subject.schema';
import type { AdminSubjectDetail, CreateSubjectPayload, PatchSubjectPayload } from '../types/roadmap.types';

/** Khớp `ColorPickerField`'s fallback (xem `subject.schema.ts`). */
const DEFAULT_COLOR = '#06B6D4';

type StudyDayValue = SubjectFormValues['defaultStudyDays'][number];
const STUDY_DAY_VALUES: readonly StudyDayValue[] = ['1', '2', '3', '4', '5', '6', '7'];

/** `number[]` (BE) → `("1".."7")[]` (giá trị `MultiSelectField`) — bỏ giá trị lạ thay vì để TS ép kiểu sai. */
function toStudyDayValues(days: number[]): StudyDayValue[] {
  return days.map((d) => String(d)).filter((d): d is StudyDayValue => STUDY_DAY_VALUES.includes(d as StudyDayValue));
}

/** Giá trị khởi tạo `SubjectCreatePage` — Thứ 2 + Thứ 5 mặc định (README §3 "đúng 8 buổi/tháng như giáo trình"). */
export function emptySubjectValues(): SubjectFormValues {
  return {
    slug: '',
    title: '',
    description: '',
    category: '',
    color: DEFAULT_COLOR,
    icon: '',
    lessonLabel: 'Buổi',
    defaultStudyDays: ['1', '4'],
    unlockMode: 'FREE',
    cover: null,
  };
}

export function subjectToFormValues(subject: AdminSubjectDetail): SubjectFormValues {
  return {
    slug: subject.slug,
    title: subject.title,
    description: subject.description ?? '',
    category: subject.category,
    color: subject.color ?? DEFAULT_COLOR,
    icon: subject.icon ?? '',
    lessonLabel: subject.lessonLabel,
    defaultStudyDays: toStudyDayValues(subject.defaultStudyDays),
    unlockMode: subject.unlockMode,
    cover: subject.coverAssetId ? { url: subject.coverAssetId, name: 'Ảnh bìa' } : null,
  };
}

export function toCreateSubjectPayload(
  values: SubjectFormValues,
  idempotencyKey: string,
): CreateSubjectPayload {
  return {
    slug: values.slug,
    title: values.title,
    description: values.description || undefined,
    category: values.category,
    color: values.color,
    icon: values.icon || undefined,
    lessonLabel: values.lessonLabel,
    defaultStudyDays: values.defaultStudyDays.map(Number),
    unlockMode: values.unlockMode,
    idempotencyKey,
  };
}

/** `coverAssetId`: id asset mới (đã tải) | `null` (gỡ ảnh) — CHỈ trường này có ở patch, không có ở create (be.md §3). */
export function toPatchSubjectPayload(
  subject: AdminSubjectDetail,
  values: SubjectFormValues,
): PatchSubjectPayload {
  return {
    id: subject.id,
    expectedVersion: subject.version,
    title: values.title,
    description: values.description,
    category: values.category,
    color: values.color,
    icon: values.icon,
    lessonLabel: values.lessonLabel,
    defaultStudyDays: values.defaultStudyDays.map(Number),
    unlockMode: values.unlockMode,
    coverAssetId: values.cover ? values.cover.url : null,
  };
}
