import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";

const L = LIMITS.talent;

/**
 * `PUT /me/career` — ghi ĐỦ hồ sơ tìm việc (không PATCH). Bật Open to work cần `consentVersion` (phiên bản chính sách dữ liệu đã đọc và đồng ý);
 * service kiểm thêm phải KHỚP phiên bản hiện hành (`SystemConfig recruiter.consentVersion`). Tắt Open to work không cần đồng ý.
 * Quyền riêng tư (`visibility`) đi qua `PUT /me/career/visibility` của p6-06 — KHÔNG ghi ở đây.
 */
export const careerSettingsSchema = z
  .object({
    openToWork: z.boolean(),
    headline: z.string().trim().max(L.headlineMax).nullable(),
    preferredRoles: z.array(z.string().trim().min(2).max(L.preferredRoleMax)).max(L.preferredRolesMax),
    location: z.string().trim().max(L.locationMax).nullable(),
    consentVersion: z.string().trim().min(1).max(20).optional(),
  })
  .strict()
  .refine((v) => !v.openToWork || !!v.consentVersion, { path: ["consentVersion"], message: "Cần đồng ý chính sách dữ liệu để bật Open to work" });
export type CareerSettingsDto = z.infer<typeof careerSettingsSchema>;
