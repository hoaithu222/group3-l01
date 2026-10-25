/**
 * Đường dẫn admin Lộ trình học — nối sau `appConfig.apiBaseUrl` (đã chứa `/v1`). Khớp
 * `be/src/modules/roadmap/roadmap.admin.routes.ts` (be.md §4); mọi route cần cờ `roadmap`, xem
 * `roadmap:view`, ghi `roadmap:create`/`roadmap:update`/`roadmap:delete` theo README §7.
 */

/** `id` từ BE đi vào đường dẫn → mã hoá để không chèn được `/`, `?`, `#`. */
const seg = encodeURIComponent;

export const roadmapApi = {
  /** GET `?status&q` (view) — `AdminSubjectRowDto[]`; POST tạo (create, `Idempotency-Key`) — `RMAP_001` slug trùng. */
  subjects: '/admin/roadmap/subjects',
  /** GET (view) · PATCH (update, CAS) · DELETE (delete, `reasonSchema`) — cây đầy đủ (phase + lesson tóm tắt). */
  subject: (id: string) => `/admin/roadmap/subjects/${seg(id)}`,
  subjectPublish: (id: string) => `/admin/roadmap/subjects/${seg(id)}/publish`,
  /** POST `{ reason }` (update). */
  subjectUnpublish: (id: string) => `/admin/roadmap/subjects/${seg(id)}/unpublish`,
  /** POST `{ reason }` (update). */
  subjectArchive: (id: string) => `/admin/roadmap/subjects/${seg(id)}/archive`,
  /** PUT `{ phases?, lessons?, expectedVersion }` (update) — sắp xếp tháng/buổi, MỘT lần khi thả kéo. */
  subjectOrder: (id: string) => `/admin/roadmap/subjects/${seg(id)}/order`,
  /** POST tạo tháng (create, `Idempotency-Key`) — `RMAP_008` quá giới hạn. */
  phases: (subjectId: string) => `/admin/roadmap/subjects/${seg(subjectId)}/phases`,
  /** PATCH (update, CAS) · DELETE (delete, `reasonSchema`) — `RMAP_003` xoá tháng còn buổi. */
  phase: (id: string) => `/admin/roadmap/phases/${seg(id)}`,
  /** POST tạo buổi (create, `Idempotency-Key`) — `RMAP_002` nội dung không hợp lệ. */
  lessons: (phaseId: string) => `/admin/roadmap/phases/${seg(phaseId)}/lessons`,
  /** GET (view) · PATCH (update, CAS) · DELETE (delete, `reasonSchema`) — `AdminLessonDto` (có `bodyMd`). */
  lesson: (id: string) => `/admin/roadmap/lessons/${seg(id)}`,
  lessonPublish: (id: string) => `/admin/roadmap/lessons/${seg(id)}/publish`,
  lessonUnpublish: (id: string) => `/admin/roadmap/lessons/${seg(id)}/unpublish`,
  /** POST `{ bodyMd }` (view) → `{ blocks, objectives, checklist, resources, warnings }` — không lưu gì. */
  preview: '/admin/roadmap/preview',
  /** POST thêm ảnh/SVG (update) — `RMAP_002` SVG xấu, `RMAP_008` quá giới hạn. */
  lessonMedia: (lessonId: string) => `/admin/roadmap/lessons/${seg(lessonId)}/media`,
  /** PATCH `{ group?, caption?, order? }` (update) · DELETE (update — media không cần lý do riêng). */
  media: (id: string) => `/admin/roadmap/media/${seg(id)}`,
  /** GET (view, P1) — `{ enrolled, active, perLesson[] }`. */
  subjectStats: (id: string) => `/admin/roadmap/subjects/${seg(id)}/stats`,
  /** GET → `{ url, expiresAt }` của asset (ảnh bìa môn/ảnh buổi kind ASSET) — endpoint chung `assets` (p0-05), không riêng roadmap. */
  assetUrl: (assetId: string) => `/assets/${seg(assetId)}/url`,
  /**
   * `GET /study-sets?scope=public&q=` — endpoint NGƯỜI DÙNG CHUNG (`be/src/modules/study/study.routes.ts`),
   * KHÔNG phải `/admin/...`. be.md không nêu endpoint tìm StudySet PUBLIC riêng cho admin; README §3 chỉ
   * nói `practiceSetIds[] → StudySet PUBLIC`. Admin đã đăng nhập nên gọi thẳng được — xem báo cáo bàn giao.
   */
  studySetsSearch: '/study-sets',
} as const;
