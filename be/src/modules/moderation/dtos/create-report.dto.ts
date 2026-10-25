import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { objectIdSchema } from "../../../shared/dto/common-schemas";
import { REPORT_REASONS, REPORT_TARGET_TYPES } from "../entities/report.interface";

const reasonEnum = z.enum(REPORT_REASONS);
const descriptionField = z.string().trim().max(LIMITS.report.descriptionMax, `Mô tả tối đa ${LIMITS.report.descriptionMax} ký tự`).optional();

const OTHER_MESSAGE = `Mô tả ít nhất ${LIMITS.report.otherDescriptionMin} ký tự khi chọn "Khác"`;
const needsDescription = (v: { reason: string; description?: string }): boolean =>
  v.reason !== "OTHER" || (v.description?.length ?? 0) >= LIMITS.report.otherDescriptionMin;

/** `POST /reports` (be.md p1-08 §3). `contextWorkspaceId` — báo cáo USER trong ngữ cảnh một workspace (→ người kiểm duyệt phạm vi xử lý). */
export const createReportSchema = z
  .object({
    targetType: z.enum(REPORT_TARGET_TYPES),
    targetId: objectIdSchema,
    reason: reasonEnum,
    description: descriptionField,
    contextWorkspaceId: objectIdSchema.optional(),
  })
  .refine(needsDescription, { message: OTHER_MESSAGE, path: ["description"] });
export type CreateReportDto = z.infer<typeof createReportSchema>;

/** `POST /messages/:messageId/report` — alias, đích lấy từ path. */
export const messageReportSchema = z
  .object({ reason: reasonEnum, description: descriptionField })
  .refine(needsDescription, { message: OTHER_MESSAGE, path: ["description"] });
export type MessageReportDto = z.infer<typeof messageReportSchema>;

export const reportIdParamSchema = z.object({ reportId: objectIdSchema });
export const messageIdParamSchema = z.object({ messageId: objectIdSchema });
