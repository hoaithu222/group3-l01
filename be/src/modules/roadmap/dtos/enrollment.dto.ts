import { z } from "zod";

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ (YYYY-MM-DD)");
const studyDaysSchema = z.array(z.number().int().min(1).max(7)).min(1).max(7).refine((v) => new Set(v).size === v.length, "Thứ học không được lặp lại");

export const enrollSchema = z.object({
  startDate: dateKeySchema,
  studyDays: studyDaysSchema,
});
export type EnrollDto = z.infer<typeof enrollSchema>;

export const patchEnrollmentSchema = z.object({
  expectedVersion: z.number().int().min(1),
  studyDays: studyDaysSchema.optional(),
  status: z.enum(["ACTIVE", "PAUSED"]).optional(),
});
export type PatchEnrollmentDto = z.infer<typeof patchEnrollmentSchema>;
