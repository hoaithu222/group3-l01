import { z } from "zod";
import { normalizeEmail } from "../../../core/auth/normalize-email";
import { LIMITS } from "../../../core/constants/limits";
import { expectedVersionSchema, objectIdSchema } from "../../../shared/dto/common-schemas";
import { COMPANY_SIZES, MEMBER_ROLES } from "../entities/recruiter.interface";

const L = LIMITS.company;
const version = expectedVersionSchema.shape.expectedVersion;

/** Website doanh nghiệp: chỉ http(s) (Zod `url()` chấp nhận cả `javascript:`). */
export const websiteSchema = z
  .string()
  .trim()
  .url("Website không hợp lệ")
  .max(200)
  .refine((u) => /^https?:\/\//i.test(u), "Website phải bắt đầu bằng http:// hoặc https://");

/** Mã số thuế Việt Nam: 10 số, hoặc 10 số + `-` + 3 số (chi nhánh). */
export const taxCodeSchema = z.string().trim().regex(/^\d{10}(-\d{3})?$/, "Mã số thuế gồm 10 số (hoặc 10 số-3 số chi nhánh)");

/** `POST /companies` — tên/website bắt buộc; còn lại tuỳ chọn. `.strict()` từ chối trường lạ (không ai tự đặt `tier`/`status`). */
export const registerCompanySchema = z
  .object({
    name: z.string().trim().min(2, "Tên doanh nghiệp tối thiểu 2 ký tự").max(L.nameMax),
    website: websiteSchema,
    taxCode: taxCodeSchema.optional(),
    description: z.string().trim().max(L.descriptionMax).optional(),
    logoAssetId: objectIdSchema.optional(),
    industry: z.string().trim().max(L.industryMax).optional(),
    sizeRange: z.enum(COMPANY_SIZES).optional(),
  })
  .strict();
export type RegisterCompanyDto = z.infer<typeof registerCompanySchema>;

/**
 * `PATCH /companies/:companyId` — chỉ trường gửi lên mới đổi; `null` xoá trường tuỳ chọn. `name`/`taxCode`/`website` bị KHOÁ khi công ty đã duyệt (APPROVED/SUSPENDED):
 * gửi giá trị KHÁC hiện tại → 409 `RECR_009`. `expectedVersion` (CAS) bắt buộc → lệch = 409 `RES_003`.
 */
export const updateCompanySchema = z
  .object({
    name: z.string().trim().min(2).max(L.nameMax).optional(),
    website: websiteSchema.optional(),
    taxCode: taxCodeSchema.nullable().optional(),
    description: z.string().trim().max(L.descriptionMax).nullable().optional(),
    logoAssetId: objectIdSchema.nullable().optional(),
    industry: z.string().trim().max(L.industryMax).nullable().optional(),
    sizeRange: z.enum(COMPANY_SIZES).nullable().optional(),
    expectedVersion: version,
  })
  .strict();
export type UpdateCompanyDto = z.infer<typeof updateCompanySchema>;

export const addMemberSchema = z
  .object({
    email: z.string().trim().email("Email không hợp lệ").max(254).transform(normalizeEmail),
    role: z.enum(MEMBER_ROLES),
  })
  .strict();
export type AddMemberDto = z.infer<typeof addMemberSchema>;

export const companyParamSchema = z.object({ companyId: objectIdSchema });
export const companyMemberParamSchema = z.object({ companyId: objectIdSchema, userId: objectIdSchema });
