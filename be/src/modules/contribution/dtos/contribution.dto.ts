import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { isValidDayKey } from "../services/day-key";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

export const boardIdParamSchema = z.object({ id: objectIdSchema });
export const exportIdParamSchema = z.object({ id: objectIdSchema });
export const memberTasksParamsSchema = z.object({ id: objectIdSchema, userId: objectIdSchema });

/** Định dạng kỳ (`ALL` | `M:yyyy-mm` | `W:gggg-Www`) kiểm ở SERVICE để trả đúng `400 CONTRIB_003`, không phải `VAL_001`. */
const period = z.string().trim().max(16);

export const contributionQuerySchema = z.object({ period: period.default("ALL") });

export const memberTasksQuerySchema = z.object({
  period: period.default("ALL"),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.contribution.memberTasksPageMax).default(LIMITS.contribution.memberTasksPageMax),
});

export type ContributionQueryDto = z.infer<typeof contributionQuerySchema>;
export type MemberTasksQueryDto = z.infer<typeof memberTasksQuerySchema>;

const dayKey = z.string().refine(isValidDayKey, "Ngày phải có dạng YYYY-MM-DD hợp lệ");

/** Khoảng ngày kiểm ở SERVICE (`assertHeatmapRange` → `400 CONTRIB_004`); ở đây chỉ kiểm dạng ngày. */
export const heatmapQuerySchema = z.object({ userId: objectIdSchema.optional(), from: dayKey, to: dayKey });
export type HeatmapQueryDto = z.infer<typeof heatmapQuerySchema>;

export const createExportSchema = z.object({ period: period, includeHeatmap: z.boolean().default(true) }).strict();
export type CreateExportDto = z.infer<typeof createExportSchema>;

export const exportDownloadQuerySchema = z.object({
  download: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .optional()
    .transform((v) => v === true || v === "true" || v === "1"),
});

export const adminStatsQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });
export const workspaceIdParamSchema = z.object({ id: objectIdSchema });
