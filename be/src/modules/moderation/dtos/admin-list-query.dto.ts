import { z } from "zod";
import { objectIdSchema, paginationSchema } from "../../../shared/dto/common-schemas";
import { REPORT_REASONS, REPORT_STATUSES, REPORT_TARGET_TYPES } from "../entities/report.interface";

/** `GET /admin/reports` — hàng đợi nền tảng (page/limit, gộp theo `groupKey`). */
export const adminListReportsQuerySchema = paginationSchema.extend({
  status: z.enum(REPORT_STATUSES).default("OPEN"),
  targetType: z.enum(REPORT_TARGET_TYPES).optional(),
  workspaceId: objectIdSchema.optional(),
  reason: z.enum(REPORT_REASONS).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.enum(["reportCount", "latest"]).default("reportCount"),
});
export type AdminListReportsQueryDto = z.infer<typeof adminListReportsQuerySchema>;
