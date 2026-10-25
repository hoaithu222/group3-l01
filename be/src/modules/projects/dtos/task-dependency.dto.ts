import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

/** p4-04: `POST /tasks/:id/dependencies` — `:id` là thẻ SAU, body chỉ định thẻ TRƯỚC. */
export const addDependencySchema = z.object({ predecessorId: objectIdSchema });

export const dependencyParamsSchema = z.object({ id: objectIdSchema, predecessorId: objectIdSchema });

export type AddDependencyDto = z.infer<typeof addDependencySchema>;

const dueFields = z.object({
  dueDate: z.coerce.date(),
  startDate: z.coerce.date().nullable().optional(),
});
const startNotAfterDue = (v: { dueDate: Date; startDate?: Date | null }): boolean => !v.startDate || v.startDate <= v.dueDate;
const startNotAfterDueIssue = { path: ["startDate"], message: "TASK_013" };

/** p4-04: `POST /tasks/:id/reschedule-preview` — hạn mới (và ngày bắt đầu khi kéo cả thanh Gantt) của thẻ nguồn. */
export const reschedulePreviewSchema = dueFields.refine(startNotAfterDue, startNotAfterDueIssue);

export type ReschedulePreviewDto = z.infer<typeof reschedulePreviewSchema>;

/**
 * p4-04: `POST /tasks/:id/reschedule` — như preview + `expectedVersion` (phiên bản thẻ nguồn) và `previewToken` (sha256 hex của
 * bản xem trước người dùng đã xác nhận; lệch với kế hoạch tính lại → `409 TASK_019`).
 */
export const rescheduleSchema = dueFields
  .extend({ expectedVersion: z.number().int().min(1), previewToken: z.string().regex(/^[a-f0-9]{64}$/) })
  .refine(startNotAfterDue, startNotAfterDueIssue);

export type RescheduleBodyDto = z.infer<typeof rescheduleSchema>;

const DAY_MS = 86_400_000;

/** p4-04 (P1): `GET /boards/:id/gantt?from&to` — `from < to`, khoảng ≤ `LIMITS.gantt.rangeMaxDays` ngày. */
export const ganttQuerySchema = z
  .object({ from: z.coerce.date(), to: z.coerce.date() })
  .refine((v) => v.from < v.to && (v.to.getTime() - v.from.getTime()) / DAY_MS <= LIMITS.gantt.rangeMaxDays, {
    path: ["to"],
    message: "Khoảng ngày không hợp lệ",
  });

export type GanttQueryDto = z.infer<typeof ganttQuerySchema>;
