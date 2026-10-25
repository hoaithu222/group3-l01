export const ROADMAP_MEDIA_KINDS = ["SVG", "ASSET"] as const;
export type RoadmapMediaKindValue = (typeof ROADMAP_MEDIA_KINDS)[number];

export interface RoadmapMedia {
  id: string;
  lessonId: string;
  subjectId: string;
  kind: RoadmapMediaKindValue;
  group: string | null;
  caption: string | null;
  svg: string | null;
  assetId: string | null;
  width: number | null;
  height: number | null;
  sourcePath: string | null;
  order: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type RoadmapMediaCreateInput = Pick<RoadmapMedia, "lessonId" | "subjectId" | "kind" | "group" | "caption" | "svg" | "assetId" | "width" | "height" | "sourcePath"> & {
  order: number;
};

export interface RoadmapMediaPatch {
  group?: string | null;
  caption?: string | null;
  order?: number;
  deletedAt?: Date | null;
}
