import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { objectIdSchema } from "../../../shared/dto/common-schemas";
import { DECLINE_REASONS, EMPLOYMENT_TYPES, OFFER_STATUSES } from "../entities/recruiter.interface";

const L = LIMITS.offer;

/** `POST /companies/:companyId/offers` — `.strict()`. `jdAssetId` = PDF đã tải lên (scope `COMPANY`, chủ = người gửi). */
export const sendOfferSchema = z
  .object({
    studentId: objectIdSchema,
    title: z.string().trim().min(L.titleMin, `Tiêu đề tối thiểu ${L.titleMin} ký tự`).max(L.titleMax),
    message: z.string().trim().min(L.messageMin, `Lời nhắn tối thiểu ${L.messageMin} ký tự`).max(L.messageMax),
    employmentType: z.enum(EMPLOYMENT_TYPES),
    location: z.string().trim().max(L.locationMax).optional(),
    jdAssetId: objectIdSchema.optional(),
  })
  .strict();
export type SendOfferDto = z.infer<typeof sendOfferSchema>;

/** `POST /me/offers/:offerId/interested` — `shareEmail` mặc định KHÔNG chia sẻ (sinh viên chủ động chọn). */
export const interestedSchema = z.object({ shareEmail: z.boolean().default(false) }).strict();
export const declineSchema = z.object({ reason: z.enum(DECLINE_REASONS) }).strict();
export type DeclineDto = z.infer<typeof declineSchema>;

export const offerMessageSchema = z
  .object({
    content: z.string().trim().min(1).max(L.threadMessageMax),
    clientMessageId: z.string().trim().min(8).max(64),
  })
  .strict();
export type OfferMessageDto = z.infer<typeof offerMessageSchema>;

const listBase = { cursor: z.string().max(200).optional(), limit: z.coerce.number().int().min(1).max(L.listPageMax).default(20) };

export const myOffersQuerySchema = z.object({ ...listBase, status: z.enum(OFFER_STATUSES).optional() });
export const companyOffersQuerySchema = z.object({ ...listBase, status: z.enum(OFFER_STATUSES).optional(), recruiterId: objectIdSchema.optional() });
export const offerMessagesQuerySchema = z.object({ ...listBase });
export const profileViewsQuerySchema = z.object({ ...listBase });

export type MyOffersQuery = z.infer<typeof myOffersQuerySchema>;
export type CompanyOffersQuery = z.infer<typeof companyOffersQuerySchema>;
export type OfferMessagesQuery = z.infer<typeof offerMessagesQuerySchema>;
export type ProfileViewsQuery = z.infer<typeof profileViewsQuerySchema>;

export const offerParamSchema = z.object({ offerId: objectIdSchema });
export const companyOfferParamSchema = z.object({ companyId: objectIdSchema, offerId: objectIdSchema });
export const blockCompanySchema = z.object({ companyId: objectIdSchema }).strict();
export const blockedCompanyParamSchema = z.object({ companyId: objectIdSchema });
