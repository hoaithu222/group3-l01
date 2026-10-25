/**
 * Kiểu dữ liệu admin Lộ trình học (p4-07) — khớp `be/src/modules/roadmap/{dtos,entities}/*.ts`
 * (be.md §2 Prisma, §3 DTO, §4 endpoint, §5.1 Block). Contract BE chưa chạy (module `be/src/modules/roadmap`
 * đang được session khác dựng song song) nên các DTO admin dưới đây viết tay theo `be.md`, chưa đối chiếu
 * runtime — khi có `openapi.json` thật, thay dần theo `AGENTS.md §"Kiểu response..."`.
 */

// ── Enum BE (be.md §2) ───────────────────────────────────────────────────────
export type RoadmapSubjectStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type RoadmapUnlockMode = 'FREE' | 'SEQUENTIAL';
export type RoadmapResourceKind = 'LINK' | 'VIDEO' | 'TOOL' | 'FILE' | 'NOTE';
export type RoadmapMediaKind = 'SVG' | 'ASSET';
/** `Subject.lessonLabel` — nhãn đơn vị buổi học, tiếng Anh gọi "Ngày", lập trình gọi "Buổi". */
export type RoadmapLessonLabel = 'Buổi' | 'Ngày' | 'Bài';

// ── Kiểu nhúng (be.md §2 `type RoadmapResource` / `RoadmapChecklistItem`) ────

/** Tài liệu của buổi — nhúng trong `RoadmapLesson.resources[]`, KHÔNG có endpoint riêng (sửa qua PATCH lesson). */
export interface RoadmapResource {
  /** "r_" + 8 ký tự — sinh ở client khi thêm mới (xem `ResourcesEditor`), BE giữ ổn định khi sửa. */
  id: string;
  kind: RoadmapResourceKind;
  /** Nhóm hiển thị tự do: "Tài liệu chính thức" | "Video" | "Công cụ" | "Nâng cao" | … */
  group: string | null;
  title: string;
  url: string | null;
  assetId: string | null;
  note: string | null;
  /** NOTE (cheatsheet, addendum) — markdown thô. */
  bodyMd: string | null;
  order: number;
}

/** Mục tự kiểm tra tách từ "## Checklist cuối buổi" khi dựng nội dung — CHỈ ĐỌC ở admin (không sửa tay). */
export interface RoadmapChecklistItem {
  id: string;
  text: string;
  group: string | null;
}

// ── Định dạng khối (be.md §5.1, `blocksFormat = 1`) — BlockPreview đọc read-only ─

export type Span =
  | { t: 'text' | 'bold' | 'italic' | 'strike' | 'code'; v: string }
  | { t: 'link'; v: string; href: string };

export type Block =
  | { type: 'heading'; level: 2 | 3 | 4; spans: Span[]; anchor: string }
  | { type: 'paragraph'; spans: Span[] }
  | { type: 'list'; ordered: boolean; start?: number; items: Block[][] }
  | { type: 'checklist'; items: { id: string; spans: Span[] }[] }
  | { type: 'code'; lang: string | null; code: string }
  | {
      type: 'table';
      align: ('left' | 'center' | 'right' | null)[];
      header: Span[][];
      rows: Span[][][];
    }
  | { type: 'quote'; blocks: Block[] }
  | { type: 'details'; summary: Span[]; blocks: Block[] }
  | { type: 'image'; mediaId: string | null; alt: string }
  | { type: 'divider' };

// ── Subject ──────────────────────────────────────────────────────────────────

/** `GET /admin/roadmap/subjects` — một dòng bảng `SubjectsTable`. */
export interface AdminSubjectRow {
  id: string;
  slug: string;
  title: string;
  category: string;
  color: string | null;
  icon: string | null;
  lessonLabel: RoadmapLessonLabel;
  status: RoadmapSubjectStatus;
  phaseCount: number;
  lessonCount: number;
  /** Số buổi đã xuất bản và KHÔNG `optional` — mẫu số của % học viên, không phải "số buổi đã xuất bản" đơn thuần. */
  requiredLessonCount: number;
  order: number;
  version: number;
  updatedAt: string;
}

export interface AdminSubjectsParams {
  status?: RoadmapSubjectStatus;
  q?: string;
}

/** Buổi tóm tắt trong cây môn — KHÔNG có `bodyMd`/`blocks` (nặng; `LessonEditorPage` tải riêng qua `GET lesson`). */
export interface AdminLessonSummary {
  id: string;
  phaseId: string;
  slug: string;
  number: number;
  title: string;
  summary: string | null;
  durationMinutes: number | null;
  optional: boolean;
  published: boolean;
  mediaCount: number;
  order: number;
  version: number;
}

export interface AdminPhase {
  id: string;
  subjectId: string;
  index: number;
  title: string;
  summary: string | null;
  stageLabel: string | null;
  color: string | null;
  capstone: string | null;
  order: number;
  lessonCount: number;
  version: number;
  lessons: AdminLessonSummary[];
}

/** `GET|PATCH /admin/roadmap/subjects/:id` — cây đầy đủ (phase + lesson tóm tắt). */
export interface AdminSubjectDetail extends AdminSubjectRow {
  description: string | null;
  coverAssetId: string | null;
  defaultStudyDays: number[];
  unlockMode: RoadmapUnlockMode;
  sourceRef: string | null;
  phases: AdminPhase[];
}

export interface CreateSubjectPayload {
  slug: string;
  title: string;
  description?: string;
  category: string;
  color?: string;
  icon?: string;
  lessonLabel: RoadmapLessonLabel;
  defaultStudyDays: number[];
  unlockMode: RoadmapUnlockMode;
  idempotencyKey: string;
}

/** `patchSubjectSchema` — partial của tạo mới + CAS; `coverAssetId` CHỈ có ở đây (create không nhận). */
export interface PatchSubjectPayload {
  id: string;
  expectedVersion: number;
  title?: string;
  description?: string;
  category?: string;
  color?: string;
  icon?: string;
  lessonLabel?: RoadmapLessonLabel;
  defaultStudyDays?: number[];
  unlockMode?: RoadmapUnlockMode;
  /** `null` xoá ảnh bìa. */
  coverAssetId?: string | null;
}

export interface ReasonPayload {
  id: string;
  reason: string;
}

// ── Phase ────────────────────────────────────────────────────────────────────

export interface CreatePhasePayload {
  subjectId: string;
  title: string;
  summary?: string;
  stageLabel?: string;
  color?: string;
  capstone?: string;
  idempotencyKey: string;
}

export interface PatchPhasePayload {
  id: string;
  expectedVersion: number;
  title?: string;
  summary?: string;
  stageLabel?: string;
  color?: string;
  capstone?: string;
}

// ── Sắp xếp (be.md §3 `reorderSchema`) — MỘT lần gọi khi thả kéo ────────────────

export interface ReorderPayload {
  subjectId: string;
  expectedVersion: number;
  phases?: { id: string; order: number }[];
  lessons?: { id: string; phaseId: string; order: number }[];
}

// ── Lesson ───────────────────────────────────────────────────────────────────

export interface AdminLessonDetail extends AdminLessonSummary {
  subjectId: string;
  prerequisites: string | null;
  objectives: string[];
  bodyMd: string;
  blocks: Block[];
  checklist: RoadmapChecklistItem[];
  resources: RoadmapResource[];
  practiceSetIds: string[];
  /**
   * Tóm tắt StudySet đã chọn (id + tiêu đề) — GIẢ ĐỊNH BE resolve kèm `practiceSetIds` (như `LessonDto`
   * người học có `practiceSets[]` tóm tắt, be.md §4). Nếu BE chỉ trả id thô, `PracticeSetPicker` vẫn chạy
   * nhưng nhãn chip của lựa chọn có sẵn (tải trang) sẽ hiện id thay vì tiêu đề — xem báo cáo bàn giao.
   */
  practiceSets?: StudySetOption[];
  /**
   * GIẢ ĐỊNH `AdminLessonDto` nhúng sẵn danh sách ảnh — be.md §4 KHÔNG có endpoint admin liệt kê media
   * của một buổi (chỉ có POST thêm + PATCH/DELETE một media theo id); endpoint liệt kê duy nhất là
   * NGƯỜI HỌC (`GET /roadmap/lessons/:id/media`), có thể bị chặn 404 với buổi CHƯA xuất bản — không dùng
   * được cho admin đang soạn nháp. Xem báo cáo bàn giao — mục "MediaManager".
   */
  media: RoadmapMediaDto[];
}

export interface CreateLessonPayload {
  phaseId: string;
  title: string;
  bodyMd: string;
  summary?: string;
  durationMinutes?: number;
  prerequisites?: string;
  optional?: boolean;
  idempotencyKey: string;
}

export interface PatchLessonPayload {
  id: string;
  expectedVersion: number;
  title?: string;
  summary?: string;
  durationMinutes?: number | null;
  prerequisites?: string | null;
  bodyMd?: string;
  resources?: RoadmapResource[];
  practiceSetIds?: string[];
  optional?: boolean;
}

export interface PreviewResult {
  blocks: Block[];
  objectives: string[];
  checklist: RoadmapChecklistItem[];
  resources: RoadmapResource[];
  warnings: string[];
}

// ── Media ────────────────────────────────────────────────────────────────────

export interface RoadmapMediaDto {
  id: string;
  lessonId: string;
  kind: RoadmapMediaKind;
  group: string | null;
  caption: string | null;
  /** SVG đã vệ sinh ở BE (`kind === 'SVG'`). */
  svg: string | null;
  assetId: string | null;
  width: number | null;
  height: number | null;
  order: number;
}

export type AddMediaPayload =
  | { lessonId: string; kind: 'ASSET'; assetId: string; group?: string; caption?: string }
  | { lessonId: string; kind: 'SVG'; svg: string; group?: string; caption?: string };

export interface PatchMediaPayload {
  id: string;
  group?: string | null;
  caption?: string | null;
  order?: number;
}

// ── Bộ luyện tập (PracticeSetPicker) ───────────────────────────────────────────

/**
 * Kết quả tìm StudySet PUBLIC — GIẢ ĐỊNH gọi thẳng `GET /study-sets?scope=public&q=` (endpoint NGƯỜI DÙNG
 * chung, `be/src/modules/study/study.routes.ts`, KHÔNG có cờ/quyền `roadmap`), vì be.md không nêu endpoint
 * tìm StudySet PUBLIC riêng cho admin. Xem báo cáo bàn giao — mục "PracticeSetPicker".
 */
export interface StudySetOption {
  id: string;
  title: string;
  itemCount: number;
}

/** `GET /assets/:id/url` — URL ký, hết hạn ngắn (như `gamification`'s `AssetUrl`). */
export interface RoadmapAssetUrl {
  url: string;
  expiresAt: string;
}
