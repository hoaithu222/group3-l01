export const ROADMAP_SUBJECT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type RoadmapSubjectStatusValue = (typeof ROADMAP_SUBJECT_STATUSES)[number];

export const ROADMAP_UNLOCK_MODES = ["FREE", "SEQUENTIAL"] as const;
export type RoadmapUnlockModeValue = (typeof ROADMAP_UNLOCK_MODES)[number];

export interface RoadmapSubject {
  id: string;
  slug: string;
  title: string;
  normalizedTitle: string;
  description: string | null;
  category: string;
  color: string | null;
  icon: string | null;
  coverAssetId: string | null;
  lessonLabel: string;
  defaultStudyDays: number[];
  unlockMode: RoadmapUnlockModeValue;
  status: RoadmapSubjectStatusValue;
  order: number;
  phaseCount: number;
  lessonCount: number;
  requiredLessonCount: number;
  sourceRef: string | null;
  version: number;
  createdBy: string;
  updatedBy: string | null;
  publishedAt: Date | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type RoadmapSubjectCreateInput = Pick<
  RoadmapSubject,
  "slug" | "title" | "normalizedTitle" | "description" | "category" | "color" | "icon" | "lessonLabel" | "defaultStudyDays" | "unlockMode" | "createdBy"
> & { order: number; sourceRef?: string | null };

export interface RoadmapSubjectPatch {
  title?: string;
  normalizedTitle?: string;
  description?: string | null;
  category?: string;
  color?: string | null;
  icon?: string | null;
  coverAssetId?: string | null;
  lessonLabel?: string;
  defaultStudyDays?: number[];
  unlockMode?: RoadmapUnlockModeValue;
  status?: RoadmapSubjectStatusValue;
  order?: number;
  phaseCount?: number;
  lessonCount?: number;
  requiredLessonCount?: number;
  updatedBy?: string | null;
  publishedAt?: Date | null;
  archivedAt?: Date | null;
  deletedAt?: Date | null;
}

export interface RoadmapPhase {
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
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type RoadmapPhaseCreateInput = Pick<RoadmapPhase, "subjectId" | "index" | "title" | "summary" | "stageLabel" | "color" | "capstone"> & {
  order: number;
};

export interface RoadmapPhasePatch {
  title?: string;
  summary?: string | null;
  stageLabel?: string | null;
  color?: string | null;
  capstone?: string | null;
  order?: number;
  lessonCount?: number;
  deletedAt?: Date | null;
}
