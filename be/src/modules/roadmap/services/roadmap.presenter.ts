import { GRADABLE_MASK, type StudySet } from "../../study/public";
import type { Block } from "../entities/block.interface";
import type { RoadmapEnrollment, RoadmapLessonProgress } from "../entities/enrollment.interface";
import type { RoadmapChecklistItem, RoadmapLesson, RoadmapResource } from "../entities/lesson.interface";
import type { RoadmapMedia } from "../entities/media.interface";
import type { RoadmapPhase, RoadmapSubject } from "../entities/subject.interface";
import { fileBasename } from "./content/media-refs";

export interface MyEnrollmentSummaryDto {
  /** `ACTIVE` | `PAUSED` | `COMPLETED` — app hiện "Tạm dừng" và ẩn "trễ lịch" khi không `ACTIVE`. */
  status: string;
  percent: number;
  /** Buổi nên học tiếp theo tiến độ THẬT (`enrollment-plan.ts`), không phải buổi mở gần nhất. */
  nextLessonId: string | null;
  behind: number;
}

export interface SubjectCardDto {
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
  unlockMode: string;
  phaseCount: number;
  lessonCount: number;
  requiredLessonCount: number;
  status: string;
  myEnrollment: MyEnrollmentSummaryDto | null;
}

export function toSubjectCard(s: RoadmapSubject, enrollment: MyEnrollmentSummaryDto | null): SubjectCardDto {
  return {
    id: s.id,
    slug: s.slug,
    title: s.title,
    description: s.description,
    category: s.category,
    color: s.color,
    icon: s.icon,
    coverAssetId: s.coverAssetId,
    lessonLabel: s.lessonLabel,
    defaultStudyDays: s.defaultStudyDays,
    unlockMode: s.unlockMode,
    phaseCount: s.phaseCount,
    lessonCount: s.lessonCount,
    requiredLessonCount: s.requiredLessonCount,
    status: s.status,
    myEnrollment: enrollment,
  };
}

export interface PhaseDto {
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

export function toPhaseDto(p: RoadmapPhase): PhaseDto {
  return { id: p.id, subjectId: p.subjectId, index: p.index, title: p.title, summary: p.summary, stageLabel: p.stageLabel, color: p.color, capstone: p.capstone, lessonCount: p.lessonCount };
}

export interface LessonSummaryDto {
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

export function toLessonSummary(l: RoadmapLesson): LessonSummaryDto {
  return {
    id: l.id,
    phaseId: l.phaseId,
    subjectId: l.subjectId,
    slug: l.slug,
    number: l.number,
    title: l.title,
    summary: l.summary,
    durationMinutes: l.durationMinutes,
    optional: l.optional,
    mediaCount: l.mediaCount,
    practiceSetIds: l.practiceSetIds,
  };
}

export interface ChecklistItemDto {
  id: string;
  text: string;
  group: string | null;
}

export function toChecklistDto(c: RoadmapChecklistItem): ChecklistItemDto {
  return { id: c.id, text: c.text, group: c.group };
}

export interface ResourceDto {
  id: string;
  kind: string;
  group: string | null;
  title: string;
  url: string | null;
  assetId: string | null;
  note: string | null;
  bodyMd: string | null;
  blocks: Block[] | null;
  order: number;
}

export function toResourceDto(r: RoadmapResource, noteBlocks: Block[] | null): ResourceDto {
  return { id: r.id, kind: r.kind, group: r.group, title: r.title, url: r.url, assetId: r.assetId, note: r.note, bodyMd: r.bodyMd, blocks: noteBlocks, order: r.order };
}

export interface MediaDto {
  id: string;
  lessonId: string;
  subjectId: string;
  kind: string;
  group: string | null;
  caption: string | null;
  /**
   * Tên tệp gốc (`product-card-mockup.svg`) của media nhập từ giáo trình — `null` với ảnh admin tải lên. App dùng để
   * khớp chữ "code/product-card-mockup.svg" còn sót trong `blocks` dựng TRƯỚC khi `md-to-blocks` biết đổi link ảnh
   * thành khối `image`, và để đặt tên hình khi thiếu `caption`.
   * ⛔ Chỉ TÊN tệp: `sourcePath` là đường dẫn tuyệt đối trên máy chạy import (lộ cấu trúc thư mục máy chủ).
   */
  fileName: string | null;
  svg: string | null;
  assetId: string | null;
  width: number | null;
  height: number | null;
  order: number;
}

export function toMediaDto(m: RoadmapMedia): MediaDto {
  return {
    id: m.id,
    lessonId: m.lessonId,
    subjectId: m.subjectId,
    kind: m.kind,
    group: m.group,
    caption: m.caption,
    fileName: m.sourcePath ? fileBasename(m.sourcePath) || null : null,
    svg: m.svg,
    assetId: m.assetId,
    width: m.width,
    height: m.height,
    order: m.order,
  };
}

export interface PracticeSetSummaryDto {
  id: string;
  title: string;
  description: string | null;
  itemCount: number;
  /** Bộ có câu CHẤM ĐƯỢC (trắc nghiệm/nhiều đáp án/đúng-sai/điền) ⇒ mở được "Quiz nhanh"/"Thi thử"; chỉ thẻ ⇒ chỉ "Học thẻ". */
  hasQuiz: boolean;
}

/** Tóm tắt bộ luyện tập gắn với buổi (`RoadmapLesson.practiceSetIds`) — dùng chung phía người học và admin. */
export function toPracticeSetSummary(set: Pick<StudySet, "id" | "title" | "description" | "itemCount" | "itemTypesMask">): PracticeSetSummaryDto {
  return { id: set.id, title: set.title, description: set.description, itemCount: set.itemCount, hasQuiz: (set.itemTypesMask & GRADABLE_MASK) !== 0 };
}

export interface ProgressDto {
  id: string;
  userId: string;
  subjectId: string;
  lessonId: string;
  status: string;
  checkedItemIds: string[];
  selfRating: number | null;
  note: string | null;
  startedAt: string | null;
  completedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export function toProgressDto(p: RoadmapLessonProgress): ProgressDto {
  return {
    id: p.id,
    userId: p.userId,
    subjectId: p.subjectId,
    lessonId: p.lessonId,
    status: p.status,
    checkedItemIds: p.checkedItemIds,
    selfRating: p.selfRating,
    note: p.note,
    startedAt: p.startedAt?.toISOString() ?? null,
    completedAt: p.completedAt?.toISOString() ?? null,
    version: p.version,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export interface LessonNavDto {
  id: string;
  number: number;
  title: string;
}

export interface LessonDto {
  id: string;
  subjectId: string;
  phaseId: string;
  lessonLabel: string;
  phaseTitle: string;
  slug: string;
  number: number;
  title: string;
  summary: string | null;
  durationMinutes: number | null;
  prerequisites: string | null;
  objectives: string[];
  blocks: Block[];
  checklist: ChecklistItemDto[];
  resources: ResourceDto[];
  practiceSets: PracticeSetSummaryDto[];
  optional: boolean;
  mediaCount: number;
  version: number;
  prev: LessonNavDto | null;
  next: LessonNavDto | null;
  myProgress: ProgressDto | null;
}

export interface EnrollmentDto {
  id: string;
  userId: string;
  subjectId: string;
  status: string;
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

export function toEnrollmentDto(e: RoadmapEnrollment): EnrollmentDto {
  return {
    id: e.id,
    userId: e.userId,
    subjectId: e.subjectId,
    status: e.status,
    anchorDate: e.anchorDate.toISOString().slice(0, 10),
    anchorNumber: e.anchorNumber,
    studyDays: e.studyDays,
    timezone: e.timezone,
    completedCount: e.completedCount,
    requiredDone: e.requiredDone,
    lastLessonId: e.lastLessonId,
    lastActivityAt: e.lastActivityAt?.toISOString() ?? null,
    rescheduledAt: e.rescheduledAt?.toISOString() ?? null,
    completedAt: e.completedAt?.toISOString() ?? null,
    version: e.version,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

export interface EnrollmentProgressDto {
  percent: number;
  completedCount: number;
  requiredDone: number;
}

export function toEnrollmentProgressDto(completedCount: number, requiredDone: number, requiredTotal: number): EnrollmentProgressDto {
  return { percent: requiredTotal > 0 ? Math.round((requiredDone / requiredTotal) * 100) : 0, completedCount, requiredDone };
}

export interface TodayItemDto {
  subject: { id: string; slug: string; title: string; color: string | null; icon: string | null; lessonLabel: string };
  lesson: LessonNavDto;
  plannedDate: string;
  behind: number;
}
