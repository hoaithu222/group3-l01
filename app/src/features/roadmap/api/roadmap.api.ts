/** Đường dẫn endpoint Roadmap, người học (be.md p4-07 §4) — nối sau `appConfig.apiBaseUrl`. Không có route admin ở đây. */

export const ROADMAP_SUBJECTS_PATH = '/roadmap/subjects';
export const ROADMAP_LESSONS_PATH = '/roadmap/lessons';
export const ROADMAP_TODAY_PATH = '/roadmap/today';

/** `idOrSlug` — `GET /roadmap/subjects/:idOrSlug` nhận cả id lẫn slug. */
export function roadmapSubjectPath(idOrSlug: string): string {
  return `${ROADMAP_SUBJECTS_PATH}/${idOrSlug}`;
}

export function roadmapEnrollPath(subjectId: string): string {
  return `${roadmapSubjectPath(subjectId)}/enroll`;
}

export function roadmapEnrollmentPath(enrollmentId: string): string {
  return `/roadmap/enrollments/${enrollmentId}`;
}

/** `POST` (P1, be.md §6 hợp đồng tóm tắt) — không nhận payload, BE tự re-anchor từ buổi bắt buộc chưa xong kế tiếp. */
export function roadmapReschedulePath(enrollmentId: string): string {
  return `${roadmapEnrollmentPath(enrollmentId)}/reschedule`;
}

export function roadmapLessonPath(lessonId: string): string {
  return `${ROADMAP_LESSONS_PATH}/${lessonId}`;
}

export function roadmapLessonMediaPath(lessonId: string): string {
  return `${roadmapLessonPath(lessonId)}/media`;
}

export function roadmapLessonProgressPath(lessonId: string): string {
  return `${roadmapLessonPath(lessonId)}/progress`;
}
