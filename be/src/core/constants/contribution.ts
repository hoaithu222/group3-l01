/**
 * Hằng số CHUNG của báo cáo đóng góp (p4-06, D-09) — nguồn duy nhất cho công thức MẶC ĐỊNH, dùng bởi registry `SystemConfig`
 * (`pm.contribution`) lẫn module `contribution` (`core` không import `modules/*`).
 *
 * Công thức: `score = 100 × Σ wᵢ·cᵢ / Σ wᵢ` trên thành phần CÓ dữ liệu; `share = score / Σ score` (README p4-06 §2).
 */
export const CONTRIBUTION_FORMULA_VERSION = 1 as const;

/** Thành phần của công thức — khoá dùng trong cấu hình, snapshot và response. */
export const CONTRIBUTION_COMPONENTS = ["points", "onTime", "peer"] as const;
export type ContributionComponent = (typeof CONTRIBUTION_COMPONENTS)[number];

export interface ContributionWeights {
  points: number;
  onTime: number;
  peer: number;
}

export interface ContributionConfigValue {
  weights: ContributionWeights;
  /** Cho phép trễ bao nhiêu giờ sau cuối ngày hạn vẫn tính đúng hạn (0–72). */
  onTimeGraceHours: number;
  /** Điểm tính cho thẻ CHƯA gán story points (0–13, bước 0,5). */
  unestimatedPoints: number;
}

/** D-09: điểm thẻ 60 · đúng hạn 20 · điểm chấm chéo 20; không cho trễ; thẻ chưa gán điểm tính 1. */
export const DEFAULT_CONTRIBUTION_CONFIG: Readonly<ContributionConfigValue> = Object.freeze({
  weights: Object.freeze({ points: 60, onTime: 20, peer: 20 }),
  onTimeGraceHours: 0,
  unestimatedPoints: 1,
});

export const CONTRIBUTION_WEIGHT_TOTAL = 100 as const;
export const CONTRIBUTION_GRACE_HOURS_MAX = 72 as const;
export const CONTRIBUTION_UNESTIMATED_POINTS_MAX = 13 as const;

/**
 * Khoá `SystemConfig` của mặc định công thức cho bảng mới (tab `pm`). PHẢI có 1–2 đoạn: `systemConfigKeyParamSchema` (`/admin/system-config/:key`) từ chối khoá 3 đoạn
 * ⇒ tên trong kế hoạch `pm.contribution.defaults` sẽ làm `PUT`/`GET` của admin trả 400 (cùng lý do p4-05 dùng `pm.review`).
 */
export const CONTRIBUTION_DEFAULTS_CONFIG_KEY = "pm.contribution" as const;
