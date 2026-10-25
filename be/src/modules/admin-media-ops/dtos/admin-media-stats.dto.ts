import { z } from "zod";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

export const DEFAULT_STATS_TZ = "Asia/Ho_Chi_Minh";

/**
 * `GET /admin/calls/stats` — định dạng do Zod kiểm (400 `VAL_001`); khoảng thời gian (`to > from`, ≤ `LIMITS.adminMedia.statsRangeMaxDays`) và múi giờ IANA do SERVICE kiểm để
 * trả đúng mã nghiệp vụ `ADMIN_MEDIA_001` (Zod chỉ ra được `VAL_001`). Trường lạ → 400.
 */
export const callStatsQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    tz: z.string().trim().min(1).max(64).default(DEFAULT_STATS_TZ),
    workspaceId: objectIdSchema.optional(),
  })
  .strict();
export type CallStatsQueryDto = z.infer<typeof callStatsQuerySchema>;

export const workspaceMediaStatsQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(92).default(30) }).strict();
export type WorkspaceMediaStatsQueryDto = z.infer<typeof workspaceMediaStatsQuerySchema>;

export const workspaceIdParamSchema = z.object({ workspaceId: objectIdSchema });
