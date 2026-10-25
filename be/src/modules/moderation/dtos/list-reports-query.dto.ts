import { z } from "zod";
import { cursorQuerySchema } from "../../../shared/dto/common-schemas";
import { REPORT_STATUSES } from "../entities/report.interface";

/** `GET /workspaces/:id/reports`, `GET /conversations/:id/reports` — hàng đợi phạm vi (cursor theo `(latestAt, groupKey)`). */
export const listScopeReportsQuerySchema = cursorQuerySchema.extend({
  status: z.enum(REPORT_STATUSES).default("OPEN"),
});
export type ListScopeReportsQueryDto = z.infer<typeof listScopeReportsQuerySchema>;

/** `GET /me/reports`. */
export const myReportsQuerySchema = cursorQuerySchema;
export type MyReportsQueryDto = z.infer<typeof myReportsQuerySchema>;
