import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { cursorQuerySchema, objectIdSchema } from "../../../shared/dto/common-schemas";
import { MENTOR_APPLICATION_STATUSES } from "../entities/mentor.interface";

const L = LIMITS.mentor;

/** Link hồ sơ CHỈ `https` (app mở bằng `WebBrowser`, app.md §6). */
const httpsUrl = z
  .string()
  .trim()
  .url("Link hồ sơ không hợp lệ")
  .max(300)
  .refine((v) => v.startsWith("https://"), { message: "Link hồ sơ phải bắt đầu bằng https://" });

export const applySchema = z.object({
  message: z.string().trim().min(L.messageMin, `Lời nhắn tối thiểu ${L.messageMin} ký tự`).max(L.messageMax, `Lời nhắn tối đa ${L.messageMax} ký tự`),
  portfolioUrl: httpsUrl.optional(),
});
export type ApplyDto = z.infer<typeof applySchema>;

export const acceptSchema = z.object({
  /** Bỏ trống → số ngày mặc định của hệ thống (`SystemConfig mentor.defaultDurationDays`, mã 30). Có gửi → `min`–`max` cứng của `LIMITS.mentor.durationDays`. */
  durationDays: z.number().int().min(L.durationDays.min).max(L.durationDays.max).optional(),
  channelIds: z.array(objectIdSchema).min(1, "Chọn ít nhất 1 kênh").max(L.channelsMax),
  createConversation: z.boolean().default(true),
  includeMemberIds: z.array(objectIdSchema).max(L.includeMembersMax).default([]),
  expectedPostVersion: z.number().int().min(1),
});
export type AcceptDto = z.infer<typeof acceptSchema>;

export const rejectSchema = z.object({ reason: z.string().trim().max(300).optional() });
export type RejectDto = z.infer<typeof rejectSchema>;

export const listApplicationsQuerySchema = cursorQuerySchema.extend({ status: z.enum(MENTOR_APPLICATION_STATUSES).optional() });
export type ListApplicationsQueryDto = z.infer<typeof listApplicationsQuerySchema>;

export const applicationIdParamsSchema = z.object({ id: objectIdSchema });
