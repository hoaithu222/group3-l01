import type { LessonFormValues } from '../schemas/lesson.schema';
import type { ResourceFormValues } from '../schemas/resource.schema';
import type { AdminLessonDetail, PatchLessonPayload, RoadmapResource } from '../types/roadmap.types';

function resourceToFormValues(r: RoadmapResource): ResourceFormValues {
  return {
    id: r.id,
    kind: r.kind,
    group: r.group ?? '',
    title: r.title,
    url: r.url ?? '',
    file: r.assetId ? { url: r.assetId, name: r.title } : null,
    note: r.note ?? '',
    bodyMd: r.bodyMd ?? '',
    order: r.order,
  };
}

/** `order` = vị trí trong mảng lúc lưu — `resources[]` không có endpoint sắp xếp riêng, vị trí mảng LÀ thứ tự. */
function formValuesToResource(v: ResourceFormValues, index: number): RoadmapResource {
  return {
    id: v.id,
    kind: v.kind,
    group: v.group || null,
    title: v.title,
    url: v.url || null,
    assetId: v.file ? v.file.url : null,
    note: v.note || null,
    bodyMd: v.bodyMd || null,
    order: index,
  };
}

export function lessonToFormValues(lesson: AdminLessonDetail): LessonFormValues {
  return {
    title: lesson.title,
    summary: lesson.summary ?? '',
    durationMinutes: lesson.durationMinutes != null ? String(lesson.durationMinutes) : '',
    prerequisites: lesson.prerequisites ?? '',
    optional: lesson.optional,
    bodyMd: lesson.bodyMd,
    resources: lesson.resources.map(resourceToFormValues),
    practiceSetIds: lesson.practiceSetIds,
  };
}

export function toPatchLessonPayload(
  lesson: AdminLessonDetail,
  values: LessonFormValues,
): PatchLessonPayload {
  return {
    id: lesson.id,
    expectedVersion: lesson.version,
    title: values.title,
    summary: values.summary,
    durationMinutes: values.durationMinutes === '' ? null : Number(values.durationMinutes),
    prerequisites: values.prerequisites,
    bodyMd: values.bodyMd,
    resources: values.resources.map(formValuesToResource),
    practiceSetIds: values.practiceSetIds,
    optional: values.optional,
  };
}
