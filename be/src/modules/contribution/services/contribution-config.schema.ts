import { z } from "zod";
import {
  CONTRIBUTION_GRACE_HOURS_MAX,
  CONTRIBUTION_UNESTIMATED_POINTS_MAX,
  CONTRIBUTION_WEIGHT_TOTAL,
  DEFAULT_CONTRIBUTION_CONFIG,
  type ContributionConfigValue,
  type ContributionWeights,
} from "../../../core/constants/contribution";

const weight = z.number().int().min(0).max(CONTRIBUTION_WEIGHT_TOTAL);
const weightsShape = z.object({ points: weight, onTime: weight, peer: weight }).strict();
const graceHours = z.number().int().min(0).max(CONTRIBUTION_GRACE_HOURS_MAX);
const unestimatedPoints = z.number().min(0).max(CONTRIBUTION_UNESTIMATED_POINTS_MAX).multipleOf(0.5);

export const weightsTotal = (w: ContributionWeights): number => w.points + w.onTime + w.peer;

/**
 * NGUỒN DUY NHẤT cho `Board.contribution` (JSON): trọng số nguyên 0–100 tổng đúng 100, cho phép trễ 0–72 giờ, điểm thẻ chưa gán 0–13 bước 0,5.
 * Dùng để ĐỌC giá trị đã lưu (`parseBoardContribution`); bản ghi hỏng → rơi về mặc định thay vì làm hỏng báo cáo.
 */
export const boardContributionConfigSchema = z
  .object({ weights: weightsShape, onTimeGraceHours: graceHours.default(0), unestimatedPoints: unestimatedPoints.default(1) })
  .refine((c) => weightsTotal(c.weights) === CONTRIBUTION_WEIGHT_TOTAL, { message: "CONTRIB_002", path: ["weights"] });

/**
 * Thân `PUT /boards/:id/contribution-config` — `.strict()` nên trường lạ (kể cả `members[]`, điểm theo người) bị `400 VAL_001`: cấu hình KHÔNG
 * nhận giá trị theo người (PM2-07). Tổng trọng số kiểm ở service (`400 CONTRIB_002`, mã nghiệp vụ riêng); `onTimeGraceHours`/`unestimatedPoints`
 * vắng = giữ giá trị hiện tại của bảng.
 */
export const putContributionConfigSchema = z
  .object({
    weights: weightsShape,
    onTimeGraceHours: graceHours.optional(),
    unestimatedPoints: unestimatedPoints.optional(),
    expectedVersion: z.number().int().min(0),
  })
  .strict();

export type PutContributionConfigDto = z.infer<typeof putContributionConfigSchema>;

/** Bản sao độc lập của mặc định mã nguồn (mặc định registry trả object đóng băng — không sửa tại chỗ). */
export function cloneConfig(c: ContributionConfigValue): ContributionConfigValue {
  return { weights: { ...c.weights }, onTimeGraceHours: c.onTimeGraceHours, unestimatedPoints: c.unestimatedPoints };
}

/** JSON đã lưu (hoặc `null`) → cấu hình hợp lệ; sai/thiếu → `fallback` (mặc định mã nguồn nếu không truyền). */
export function parseBoardContribution(raw: unknown, fallback: ContributionConfigValue = DEFAULT_CONTRIBUTION_CONFIG): ContributionConfigValue {
  const parsed = boardContributionConfigSchema.safeParse(raw);
  return parsed.success ? cloneConfig(parsed.data) : cloneConfig(fallback);
}
