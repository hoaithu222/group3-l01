import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { safeTimeZone } from "../../../core/utils/local-date";
import { expectedVersionSchema, objectIdSchema, reasonSchema } from "../../../shared/dto/common-schemas";
import { COMPANY_STATUSES, COMPANY_TIERS } from "../entities/recruiter.interface";
import { taxCodeSchema, websiteSchema } from "./company.dto";

const DAY_MS = 24 * 3600 * 1000;

/** `GET /admin/companies` — phân trang trang/limit (vận hành). `q` tìm theo tên (không dấu, khớp chứa). */
export const adminCompaniesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIMITS.company.adminPageMax).default(20),
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum(COMPANY_STATUSES).optional(),
  tier: z.enum(COMPANY_TIERS).optional(),
});
export type AdminCompaniesQuery = z.infer<typeof adminCompaniesQuerySchema>;

/** `POST /admin/companies/:companyId/(approve|reject|suspend|reinstate)` — lý do bắt buộc (10–500 ký tự), ghi audit. */
export const adminCompanyActionSchema = reasonSchema.strict();

/** `PATCH /admin/companies/:companyId` — đổi gói/hạn mức và sửa tên/website/MST (vận hành được sửa cả khi đã duyệt). */
export const adminCompanyPatchSchema = z
  .object({
    tier: z.enum(COMPANY_TIERS).optional(),
    offerQuotaOverride: z.number().int().min(0).max(10_000).nullable().optional(),
    name: z.string().trim().min(2).max(LIMITS.company.nameMax).optional(),
    website: websiteSchema.optional(),
    taxCode: taxCodeSchema.nullable().optional(),
  })
  .merge(reasonSchema)
  .merge(expectedVersionSchema)
  .strict();
export type AdminCompanyPatchDto = z.infer<typeof adminCompanyPatchSchema>;

/** `GET /admin/recruiter/stats` — khoảng ≤ 366 ngày (`from ≤ to`); `tz` IANA hợp lệ. */
export const statsQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    tz: z.string().default("Asia/Ho_Chi_Minh").refine((tz) => safeTimeZone(tz) === tz, "Múi giờ không hợp lệ"),
  })
  .refine((v) => v.to.getTime() >= v.from.getTime(), { path: ["to"], message: "Ngày kết thúc phải sau ngày bắt đầu" })
  .refine((v) => v.to.getTime() - v.from.getTime() <= LIMITS.company.statsMaxDays * DAY_MS, { path: ["to"], message: `Khoảng thống kê tối đa ${LIMITS.company.statsMaxDays} ngày` });
export type StatsQuery = z.infer<typeof statsQuerySchema>;

export const adminCompanyParamSchema = z.object({ companyId: objectIdSchema });
