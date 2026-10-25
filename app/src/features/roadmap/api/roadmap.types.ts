/**
 * DTO của p4-07 (lộ trình học) — VIẾT TAY vì công cụ sinh kiểu OpenAPI (p0-09) chưa có, đối chiếu với
 * `docs/plans/phase-4-study-gamification/p4-07-learning-roadmap/be.md` §2–§4 (BE `roadmap` đang được một phiên
 * khác dựng SONG SONG — chưa chạy được nên KHÔNG kiểm được bằng request thật).
 *
 * Ngày tháng là chuỗi ISO qua JSON (không phải `Date`). Field nào be.md không nói rõ optional hay `| null` thì
 * theo quy ước `study.types.ts`: RESPONSE dùng `| null` tường minh, chỉ REQUEST payload mới dùng `?:`.
 *
 * ⚠️ Vài chỗ THÊM ngoài chữ nghĩa tóm tắt của be.md §4 (đã ghi rõ tại chỗ) — vì màn hình app.md §3 cần mà bảng
 * endpoint (vốn chỉ là "Hợp đồng TÓM TẮT", README §6) không liệt hết field:
 *   1. `RoadmapSubjectDetailDto.myEnrollment` — bản ĐẦY ĐỦ `RoadmapEnrollmentDto`, không chỉ 3 field tóm tắt của
 *      thẻ danh sách, để `SubjectHeader`/`EnrollSheet` biết đã đăng ký chưa và đọc `studyDays` hiện tại.
 *   2. `RoadmapProgressUpdateResultDto.enrollment` — thêm `completedCount`/`requiredDone` cạnh `percent`.
 *   3. `RoadmapLessonDto.lessonLabel`/`phaseTitle` — be.md ghi lesson chỉ có "meta" chung chung; `LessonHeader`
 *      (app.md §3: "Tháng · Buổi, thời lượng…") cần hai chuỗi NGỮ CẢNH này mà không phải gọi thêm API môn.
 * Phiên BE cần đối chiếu lại các điểm này khi dựng presenter thật.
 */

// ── Khối nội dung buổi học (be.md §5.1, `blocksFormat = 1`) ─────────────────────────────────────────────────────
// ⛔ SAO CHÉP NGUYÊN VĂN — app CHỈ ĐỌC, không tự dựng khối (BE dựng từ `bodyMd` lúc lưu/import).

export type Span =
  | { t: 'text' | 'bold' | 'italic' | 'strike' | 'code'; v: string }
  | { t: 'link'; v: string; href: string };

export type Block =
  // H1 bỏ (đã là `title` của buổi).
  | { type: 'heading'; level: 2 | 3 | 4; spans: Span[]; anchor: string }
  | { type: 'paragraph'; spans: Span[] }
  | { type: 'list'; ordered: boolean; start?: number; items: Block[][] }
  // "- [ ]" còn lại trong thân bài (bài tập) — chỉ hiển thị, không phải checklist tự kiểm tra của tab riêng.
  | { type: 'checklist'; items: { id: string; spans: Span[] }[] }
  | { type: 'code'; lang: string | null; code: string }
  | { type: 'table'; align: ('left' | 'center' | 'right' | null)[]; header: Span[][]; rows: Span[][][] }
  | { type: 'quote'; blocks: Block[] }
  | { type: 'details'; summary: Span[]; blocks: Block[] }
  // `mediaId` null = không tìm thấy (BE đã cảnh báo lúc dựng).
  | { type: 'image'; mediaId: string | null; alt: string }
  | { type: 'divider' };

// ── Enum ──────────────────────────────────────────────────────────────────────────────────────────────────────

export const ROADMAP_UNLOCK_MODES = ['FREE', 'SEQUENTIAL'] as const;
export type RoadmapUnlockMode = (typeof ROADMAP_UNLOCK_MODES)[number];

export const ROADMAP_ENROLLMENT_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED'] as const;
export type RoadmapEnrollmentStatus = (typeof ROADMAP_ENROLLMENT_STATUSES)[number];

export const ROADMAP_PROGRESS_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'] as const;
export type RoadmapProgressStatus = (typeof ROADMAP_PROGRESS_STATUSES)[number];

export const ROADMAP_RESOURCE_KINDS = ['LINK', 'VIDEO', 'TOOL', 'FILE', 'NOTE'] as const;
export type RoadmapResourceKind = (typeof ROADMAP_RESOURCE_KINDS)[number];

export const ROADMAP_MEDIA_KINDS = ['SVG', 'ASSET'] as const;
export type RoadmapMediaKind = (typeof ROADMAP_MEDIA_KINDS)[number];

// ── Subject / Phase ───────────────────────────────────────────────────────────────────────────────────────────

/** `GET /roadmap/subjects` — một item + tóm tắt đăng ký của TÔI (be.md §4). */
export interface RoadmapSubjectCardDto {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  color: string | null;
  icon: string | null;
  coverAssetId: string | null;
  lessonLabel: string;
  defaultStudyDays: number[];
  unlockMode: RoadmapUnlockMode;
  phaseCount: number;
  lessonCount: number;
  requiredLessonCount: number;
  myEnrollment: RoadmapMyEnrollmentSummaryDto | null;
}

export interface RoadmapMyEnrollmentSummaryDto {
  percent: number;
  nextLessonId: string | null;
  behind: number;
}

export interface RoadmapPhaseDto {
  id: string;
  subjectId: string;
  index: number;
  title: string;
  summary: string | null;
  stageLabel: string | null;
  color: string | null;
  capstone: string | null;
  lessonCount: number;
}

/** Buổi TÓM TẮT trong `SubjectDetailDto.lessons[]` — không có `blocks`/`checklist`/`resources`. */
export interface RoadmapLessonSummaryDto {
  id: string;
  phaseId: string;
  subjectId: string;
  slug: string;
  number: number;
  title: string;
  summary: string | null;
  durationMinutes: number | null;
  optional: boolean;
  mediaCount: number;
  practiceSetIds: string[];
}

/** `GET /roadmap/subjects/:idOrSlug` — môn + cây tháng/buổi tóm tắt + tiến độ + lịch (be.md §4). */
export interface RoadmapSubjectDetailDto {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  color: string | null;
  icon: string | null;
  coverAssetId: string | null;
  lessonLabel: string;
  defaultStudyDays: number[];
  unlockMode: RoadmapUnlockMode;
  phaseCount: number;
  lessonCount: number;
  requiredLessonCount: number;
  phases: RoadmapPhaseDto[];
  lessons: RoadmapLessonSummaryDto[];
  /** `lessonId → trạng thái`. Rỗng khi chưa đăng ký. */
  progress: Record<string, RoadmapProgressStatus>;
  /** `lessonId → 'YYYY-MM-DD'`. Rỗng khi chưa đăng ký (không có `anchorDate` để tính). */
  schedule: Record<string, string>;
  /** ⚠️ Thêm ngoài be.md §4 (xem đầu file) — bản ĐẦY ĐỦ, không chỉ tóm tắt percent/nextLessonId/behind. */
  myEnrollment: RoadmapEnrollmentDto | null;
}

// ── Enrollment ────────────────────────────────────────────────────────────────────────────────────────────────

/** Khớp model Prisma `RoadmapEnrollment` (be.md §2) — `POST enroll` / `PATCH enrollment` / nhúng trong detail. */
export interface RoadmapEnrollmentDto {
  id: string;
  userId: string;
  subjectId: string;
  status: RoadmapEnrollmentStatus;
  anchorDate: string;
  anchorNumber: number;
  studyDays: number[];
  timezone: string;
  completedCount: number;
  requiredDone: number;
  lastLessonId: string | null;
  lastActivityAt: string | null;
  rescheduledAt: string | null;
  completedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoadmapEnrollPayload {
  /** `YYYY-MM-DD`. */
  startDate: string;
  studyDays: number[];
}

export interface RoadmapPatchEnrollmentPayload {
  expectedVersion: number;
  studyDays?: number[];
  status?: 'ACTIVE' | 'PAUSED';
}

// ── Lesson ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface RoadmapLessonNavDto {
  id: string;
  number: number;
  title: string;
}

export interface RoadmapPracticeSetSummaryDto {
  id: string;
  title: string;
  itemCount: number;
  hasQuiz: boolean;
}

export interface RoadmapChecklistItemDto {
  id: string;
  text: string;
  group: string | null;
}

export interface RoadmapResourceDto {
  id: string;
  kind: RoadmapResourceKind;
  group: string | null;
  title: string;
  url: string | null;
  assetId: string | null;
  note: string | null;
  bodyMd: string | null;
  /** Chỉ có ở `kind: 'NOTE'` — dựng sẵn từ `bodyMd` qua presenter (README §3 "app nhận `blocks` dựng sẵn"). */
  blocks: Block[] | null;
  order: number;
}

export interface RoadmapProgressDto {
  id: string;
  userId: string;
  subjectId: string;
  lessonId: string;
  status: RoadmapProgressStatus;
  checkedItemIds: string[];
  selfRating: 1 | 2 | 3 | null;
  note: string | null;
  startedAt: string | null;
  completedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** `GET /roadmap/lessons/:id` — meta + nội dung đầy đủ + điều hướng + tiến độ của TÔI (be.md §4). */
export interface RoadmapLessonDto {
  id: string;
  subjectId: string;
  phaseId: string;
  /** ⚠️ Thêm ngoài be.md §4 (xem đầu file) — cho `LessonHeader` ("Tháng · Buổi…") không phải gọi thêm API môn. */
  phaseTitle: string;
  /** `Subject.lessonLabel` ("Buổi" | "Ngày" | "Bài") — cùng lý do `phaseTitle`. */
  lessonLabel: string;
  slug: string;
  number: number;
  title: string;
  summary: string | null;
  durationMinutes: number | null;
  prerequisites: string | null;
  objectives: string[];
  blocks: Block[];
  checklist: RoadmapChecklistItemDto[];
  resources: RoadmapResourceDto[];
  practiceSets: RoadmapPracticeSetSummaryDto[];
  optional: boolean;
  mediaCount: number;
  prev: RoadmapLessonNavDto | null;
  next: RoadmapLessonNavDto | null;
  myProgress: RoadmapProgressDto | null;
}

export interface RoadmapMediaDto {
  id: string;
  lessonId: string;
  subjectId: string;
  kind: RoadmapMediaKind;
  group: string | null;
  caption: string | null;
  /**
   * Tên tệp gốc (`product-card-mockup.svg`) của media nhập từ giáo trình, `null` với ảnh admin tải lên — đặt tên hình
   * khi thiếu `caption`. ⚠️ Optional: BE trước p4-07 bản vá ảnh chưa trả trường này.
   */
  fileName?: string | null;
  /** Chỉ có ở `kind: 'SVG'` — đã vệ sinh phía BE, vẫn vẽ qua `SvgMedia` bọc error boundary. */
  svg: string | null;
  /** Chỉ có ở `kind: 'ASSET'` — xin URL qua `useAssetUrl(assetId)`. */
  assetId: string | null;
  width: number | null;
  height: number | null;
  order: number;
}

export interface RoadmapPutProgressPayload {
  /** BE từ chối đặt `NOT_STARTED` từ `COMPLETED` — dùng "Học lại" = `IN_PROGRESS` (be.md §3). */
  status?: RoadmapProgressStatus;
  checkedItemIds?: string[];
  selfRating?: 1 | 2 | 3;
  note?: string;
}

export interface RoadmapEnrollmentProgressDto {
  percent: number;
  completedCount: number;
  requiredDone: number;
}

/** `PUT /roadmap/lessons/:id/progress` response. */
export interface RoadmapProgressUpdateResultDto {
  progress: RoadmapProgressDto;
  enrollment: RoadmapEnrollmentProgressDto;
}

// ── Today ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface RoadmapTodaySubjectRefDto {
  id: string;
  slug: string;
  title: string;
  color: string | null;
  icon: string | null;
  lessonLabel: string;
}

/** Một phần tử của `GET /roadmap/today` — MỘT dòng mỗi enrollment `ACTIVE` (người học có thể học nhiều môn). */
export interface RoadmapTodayItemDto {
  subject: RoadmapTodaySubjectRefDto;
  lesson: RoadmapLessonNavDto;
  /** `YYYY-MM-DD`. */
  plannedDate: string;
  behind: number;
}
