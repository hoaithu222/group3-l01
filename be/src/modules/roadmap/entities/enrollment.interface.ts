export const ROADMAP_ENROLLMENT_STATUSES = ["ACTIVE", "PAUSED", "COMPLETED"] as const;
export type RoadmapEnrollmentStatusValue = (typeof ROADMAP_ENROLLMENT_STATUSES)[number];

export const ROADMAP_PROGRESS_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "SKIPPED"] as const;
export type RoadmapProgressStatusValue = (typeof ROADMAP_PROGRESS_STATUSES)[number];

export interface RoadmapEnrollment {
  id: string;
  userId: string;
  subjectId: string;
  status: RoadmapEnrollmentStatusValue;
  anchorDate: Date;
  anchorNumber: number;
  studyDays: number[];
  timezone: string;
  completedCount: number;
  requiredDone: number;
  lastLessonId: string | null;
  lastActivityAt: Date | null;
  rescheduledAt: Date | null;
  completedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoadmapEnrollmentCreateInput {
  userId: string;
  subjectId: string;
  anchorDate: Date;
  anchorNumber: number;
  studyDays: number[];
  timezone: string;
}

export interface RoadmapEnrollmentPatch {
  status?: RoadmapEnrollmentStatusValue;
  anchorDate?: Date;
  anchorNumber?: number;
  studyDays?: number[];
  completedCount?: number;
  requiredDone?: number;
  lastLessonId?: string | null;
  lastActivityAt?: Date | null;
  rescheduledAt?: Date | null;
  completedAt?: Date | null;
}

export interface RoadmapLessonProgress {
  id: string;
  userId: string;
  subjectId: string;
  lessonId: string;
  status: RoadmapProgressStatusValue;
  checkedItemIds: string[];
  selfRating: number | null;
  note: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoadmapLessonProgressPatch {
  status?: RoadmapProgressStatusValue;
  checkedItemIds?: string[];
  selfRating?: number | null;
  note?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
}
