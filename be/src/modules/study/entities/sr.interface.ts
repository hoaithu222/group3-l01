import type { SrRatingValue, SrState, SrStatusValue } from "../services/sm2";

export type SrSourceValue = "ENROLL" | "MOCK_WRONG";
/** Lý do tạm ngừng tự động (mất quyền bộ / bộ ẩn hoặc xoá). */
export type SrSuspendReason = "LOST_ACCESS" | "SET_HIDDEN";

/** Entity domain — khớp model Prisma `SrProgress`. */
export interface SrProgress extends SrState {
  id: string;
  userId: string;
  itemId: string;
  setId: string;
  status: SrStatusValue;
  source: SrSourceValue;
  itemOrder: number;
  suspendedReason: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export type SrProgressCreateInput = Pick<SrProgress, "userId" | "itemId" | "setId" | "source" | "itemOrder"> & SrState;

/** Trường ghi khi ôn / lapse — `version + 1` do repository tăng. */
export type SrProgressPatch = Partial<SrState>;

export interface SrEnrollment {
  id: string;
  userId: string;
  setId: string;
  active: boolean;
  newPerDay: number;
  syncedVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SrReviewLog {
  id: string;
  userId: string;
  itemId: string;
  setId: string;
  clientReviewId: string;
  rating: SrRatingValue;
  /** q SM-2 (1 | 3 | 4 | 5; 2 = lapse). */
  grade: number;
  prevInterval: number;
  newInterval: number;
  localDate: string;
  reviewedAt: Date;
}

export type SrReviewLogCreateInput = Omit<SrReviewLog, "id">;

/** Khoảng lọc thẻ đến hạn của MỘT người. */
export interface SrDueQuery {
  /** `nextReviewAt < before` (cuối ngày địa phương). */
  before: Date;
  limit: number;
  setIds?: readonly string[];
}
