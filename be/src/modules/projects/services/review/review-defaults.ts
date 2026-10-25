import { LIMITS } from "../../../../core/constants/limits";
import { runtimeConfig } from "../../../../core/config/runtime-config";
import type { BoardReviewConfig } from "../../entities/task-review.interface";
import { defaultBoardReview, DEFAULT_REQUIRED_REVIEWS } from "./review-config.schema";

/** Mặc định chấm chéo (`SystemConfig pm.review`): áp cho BẢNG MỚI và mốc nhắc người chấm. */
export interface ReviewDefaults {
  enabledForNewBoards: boolean;
  requiredReviews: number;
  /** 1–3 mốc TĂNG DẦN (giờ kể từ lúc được giao chấm). */
  reminderHours: number[];
}

export interface IReviewDefaults {
  load(): Promise<ReviewDefaults>;
}

export const FALLBACK_REVIEW_DEFAULTS: ReviewDefaults = { enabledForNewBoards: false, requiredReviews: DEFAULT_REQUIRED_REVIEWS, reminderHours: [24, 72] };

const hoursOf = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [...FALLBACK_REVIEW_DEFAULTS.reminderHours];
  const hours = value.filter((h): h is number => typeof h === "number" && Number.isInteger(h) && h >= 1 && h <= 168);
  return hours.length > 0 ? hours.slice(0, 3).sort((a, b) => a - b) : [...FALLBACK_REVIEW_DEFAULTS.reminderHours];
};

/** Đọc qua `runtimeConfig` (bộ nhớ → Redis → Mongo, fail-open về mặc định); giá trị hỏng → mặc định. */
export class RuntimeReviewDefaults implements IReviewDefaults {
  async load(): Promise<ReviewDefaults> {
    const v = await runtimeConfig.getEffective("pm.review");
    const required = typeof v.requiredReviews === "number" && Number.isFinite(v.requiredReviews) ? Math.trunc(v.requiredReviews) : DEFAULT_REQUIRED_REVIEWS;
    return {
      enabledForNewBoards: v.enabledForNewBoards === true,
      requiredReviews: Math.min(LIMITS.review.requiredMax, Math.max(1, required)),
      reminderHours: hoursOf(v.reminderHours),
    };
  }
}

/** Ảnh chụp cấu hình cho bảng mới từ mặc định hệ thống (bảng đang có KHÔNG bị đổi khi admin sửa mặc định). */
export const snapshotForNewBoard = (d: ReviewDefaults): BoardReviewConfig => defaultBoardReview(d.requiredReviews, d.enabledForNewBoards);
