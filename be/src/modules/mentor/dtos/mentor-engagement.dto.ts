import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { objectIdSchema, reasonSchema } from "../../../shared/dto/common-schemas";
import { MENTOR_ENGAGEMENT_STATUSES } from "../entities/mentor.interface";
import { REPORT_REASONS_FOR_MENTOR } from "../services/mentor-report.constants";

export const extendSchema = z.object({
  addDays: z.number().int().min(1).max(LIMITS.mentor.durationDays.max),
  expectedVersion: z.number().int().min(1),
});
export type ExtendDto = z.infer<typeof extendSchema>;

/** Lý do tuỳ chọn khi nhóm/cố vấn tự kết thúc (không bắt 10 ký tự như thao tác quản trị). */
export const endSchema = z.object({ reason: z.string().trim().max(300).optional() });
export type EndDto = z.infer<typeof endSchema>;

export const listEngagementsQuerySchema = z.object({ status: z.enum(MENTOR_ENGAGEMENT_STATUSES).optional() });
export type ListEngagementsQueryDto = z.infer<typeof listEngagementsQuerySchema>;

export const engagementIdParamsSchema = z.object({ id: objectIdSchema });

/** `POST /mentor/posts/:id/report` — cùng lý do với p1-08 (`OTHER` bắt buộc mô tả). */
export const reportPostSchema = z
  .object({
    reason: z.enum(REPORT_REASONS_FOR_MENTOR),
    description: z.string().trim().max(LIMITS.report.descriptionMax).optional(),
  })
  .refine((v) => v.reason !== "OTHER" || (v.description ?? "").length >= LIMITS.report.otherDescriptionMin, {
    message: `Lý do "Khác" cần mô tả tối thiểu ${LIMITS.report.otherDescriptionMin} ký tự`,
    path: ["description"],
  });
export type ReportPostDto = z.infer<typeof reportPostSchema>;

/** Thao tác quản trị: lý do bắt buộc 10–500 ký tự (02-conventions). */
export const adminReasonSchema = reasonSchema;
export type AdminReasonDto = z.infer<typeof adminReasonSchema>;
