import { z } from "zod";
import { burnoutRuleSetSchema } from "../../../core/constants/burnout";
import { LIMITS } from "../../../core/constants/limits";
import { objectIdSchema, reasonSchema } from "../../../shared/dto/common-schemas";
import { ACK_ACTIONS } from "../entities/burnout.interface";

const pb = LIMITS.wellbeing.preferredBreak;
const assessmentDays: readonly number[] = LIMITS.wellbeing.assessmentDays;

/**
 * `PUT /me/wellbeing` (p7-03 be.md §3). `optIn` LUÔN bắt buộc: `true` = bật (hoặc chỉ sửa cài đặt nếu đã bật), `false` = tắt VÀ xoá dữ liệu — không có đường nào bật mà người dùng không chủ động gửi `optIn: true`.
 * `.strict()` để trường lạ (vd cố gửi `userId`) bị từ chối thay vì bị bỏ qua âm thầm.
 */
const preferredBreakSchema = z
  .object({
    workMinutes: z.number().int().min(pb.workMinutesMin).max(pb.workMinutesMax),
    breakMinutes: z.number().int().min(pb.breakMinutesMin).max(pb.breakMinutesMax),
  })
  .strict()
  .nullable()
  .optional();

export const updateSettingSchema = z
  .object({
    optIn: z.boolean(),
    alertsEnabled: z.boolean().optional(),
    preferredBreak: preferredBreakSchema,
  })
  .strict();
export type UpdateSettingDto = z.infer<typeof updateSettingSchema>;

/**
 * `PATCH /me/wellbeing` — CHỈ sửa cài đặt phụ (nhắc nhẹ, giờ nghỉ) của người ĐANG bật; KHÔNG có `optIn` và KHÔNG bao giờ bật theo dõi.
 * Vì sao tách khỏi `PUT`: `PUT` luôn đòi `optIn`, nên client đổi một công tắc phụ bằng `optIn: true` trên tài khoản đã TẮT ở máy khác
 * sẽ LÉN BẬT LẠI theo dõi — vi phạm nguyên tắc đồng ý rõ ràng (opt-in). Chưa bật ⇒ `WELL_001` (409), không ghi gì.
 * Phải có ít nhất một trường (body rỗng là lỗi của client, không phải "không đổi gì").
 */
export const patchSettingSchema = z
  .object({
    alertsEnabled: z.boolean().optional(),
    preferredBreak: preferredBreakSchema,
  })
  .strict()
  .refine((v) => v.alertsEnabled !== undefined || v.preferredBreak !== undefined, "Cần ít nhất một cài đặt để sửa");
export type PatchSettingDto = z.infer<typeof patchSettingSchema>;

/** `GET /me/wellbeing/assessments?days=7|30` (mặc định 7). */
export const assessmentsQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((v) => assessmentDays.includes(v), "days phải là 7 hoặc 30")
    .default(7),
});
export type AssessmentsQueryDto = z.infer<typeof assessmentsQuerySchema>;

/** `POST /me/wellbeing/alerts/:id/ack` — "Đã hiểu" / "Nhắc lại sau". */
export const ackSchema = z.object({ action: z.enum(ACK_ACTIONS) }).strict();
export type AckDto = z.infer<typeof ackSchema>;

/** `GET /admin/wellbeing/overview?weeks=1..12` (mặc định 12). */
export const overviewQuerySchema = z.object({
  weeks: z.coerce.number().int().min(1).max(LIMITS.wellbeing.overviewMaxWeeks).default(LIMITS.wellbeing.overviewMaxWeeks),
});
export type OverviewQueryDto = z.infer<typeof overviewQuerySchema>;

/**
 * `PUT /admin/wellbeing/rules` — hình dạng theo `burnoutRuleSetSchema` (nguồn chung với registry) BỎ `version` (máy chủ tự tăng) + `expectedVersion` (CAS theo `version` bộ luật admin đang xem) + `reason`.
 * Ràng buộc chéo (medium < high, mã luật duy nhất, days ≤ windowDays) do service kiểm để trả đúng `WELL_003`/`WELL_004`.
 */
export const updateRulesSchema = burnoutRuleSetSchema
  .omit({ version: true })
  .extend({ expectedVersion: z.number().int().min(1), reason: reasonSchema.shape.reason })
  .strict();
export type UpdateRulesDto = z.infer<typeof updateRulesSchema>;

/** `PUT / DELETE /me/wellbeing/shares/:workspaceId` (P1). */
export const shareParamSchema = z.object({ workspaceId: objectIdSchema });
export type ShareParamDto = z.infer<typeof shareParamSchema>;

/** `GET /workspaces/:id/wellbeing/indicators` (P1) — cùng hình dạng `workspaceIdParamSchema` của `gamification`/`contribution` (param `id`, route `/workspaces/:id/...`). */
export const workspaceIdParamSchema = z.object({ id: objectIdSchema });
export type WorkspaceIdParamDto = z.infer<typeof workspaceIdParamSchema>;

/**
 * `POST /me/wellbeing/break` (P1) — TakeABreakWidget báo đã nghỉ xong. CHỈ đếm qua rate limiter (`scopeLimiter`), KHÔNG lưu bản ghi riêng và
 * KHÔNG ảnh hưởng `riskScore` (be.md §4) — không có model `WellbeingBreak` nào cả, endpoint chỉ xác nhận + giới hạn tần suất.
 */
export const breakSchema = z
  .object({ durationSeconds: z.number().int().min(LIMITS.wellbeing.breakDurationSecondsMin).max(LIMITS.wellbeing.breakDurationSecondsMax) })
  .strict();
export type BreakDto = z.infer<typeof breakSchema>;
