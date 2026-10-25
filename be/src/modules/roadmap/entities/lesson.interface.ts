import type { Block } from "./block.interface";

export const ROADMAP_RESOURCE_KINDS = ["LINK", "VIDEO", "TOOL", "FILE", "NOTE"] as const;
export type RoadmapResourceKindValue = (typeof ROADMAP_RESOURCE_KINDS)[number];

export interface RoadmapResource {
  id: string;
  kind: RoadmapResourceKindValue;
  group: string | null;
  title: string;
  url: string | null;
  assetId: string | null;
  note: string | null;
  /** NOTE (cheatsheet, addendum) — markdown nguồn; presenter dựng `blocks` khi trả về app. */
  bodyMd: string | null;
  order: number;
}

export interface RoadmapChecklistItem {
  id: string;
  text: string;
  group: string | null;
}

export interface RoadmapLesson {
  id: string;
  subjectId: string;
  phaseId: string;
  slug: string;
  number: number;
  title: string;
  normalizedTitle: string;
  summary: string | null;
  durationMinutes: number | null;
  prerequisites: string | null;
  objectives: string[];
  bodyMd: string;
  blocks: Block[];
  blocksFormat: number;
  checklist: RoadmapChecklistItem[];
  resources: RoadmapResource[];
  practiceSetIds: string[];
  mediaCount: number;
  optional: boolean;
  published: boolean;
  order: number;
  version: number;
  updatedBy: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type RoadmapLessonCreateInput = Pick<
  RoadmapLesson,
  | "subjectId"
  | "phaseId"
  | "slug"
  | "number"
  | "title"
  | "normalizedTitle"
  | "summary"
  | "durationMinutes"
  | "prerequisites"
  | "objectives"
  | "bodyMd"
  | "blocks"
  | "checklist"
  | "resources"
  | "practiceSetIds"
  | "optional"
> & { order: number; published?: boolean; updatedBy?: string | null };

export interface RoadmapLessonPatch {
  title?: string;
  normalizedTitle?: string;
  summary?: string | null;
  durationMinutes?: number | null;
  prerequisites?: string | null;
  objectives?: string[];
  bodyMd?: string;
  blocks?: Block[];
  /** Ghi cùng `blocks` mỗi lần dựng lại — `BLOCKS_FORMAT_VERSION` (block.interface.ts). */
  blocksFormat?: number;
  checklist?: RoadmapChecklistItem[];
  resources?: RoadmapResource[];
  practiceSetIds?: string[];
  mediaCount?: number;
  optional?: boolean;
  published?: boolean;
  order?: number;
  number?: number;
  phaseId?: string;
  updatedBy?: string | null;
  deletedAt?: Date | null;
}
