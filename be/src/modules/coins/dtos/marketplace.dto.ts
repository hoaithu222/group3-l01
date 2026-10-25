import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { cursorQuerySchema, idParamSchema, objectIdSchema, reasonSchema } from "../../../shared/dto/common-schemas";
import { LISTING_CONTENT_TYPES, LISTING_REPORT_REASONS } from "../entities/coins.interface";

/** `POST /marketplace/listings` (p7-02 be.md §3). */
export const createListingSchema = z.object({
  contentType: z.enum(LISTING_CONTENT_TYPES),
  contentId: objectIdSchema,
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(5).default([]),
  price: z.number().int().min(LIMITS.marketplace.priceMin).max(LIMITS.marketplace.priceMax),
});
export type CreateListingDto = z.infer<typeof createListingSchema>;

/** `PATCH /marketplace/listings/:id` — CAS `expectedVersion`; `contentType`/`contentId` bất biến. */
export const updateListingSchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    title: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(30)).max(5).optional(),
    price: z.number().int().min(LIMITS.marketplace.priceMin).max(LIMITS.marketplace.priceMax).optional(),
  })
  .strict();
export type UpdateListingDto = z.infer<typeof updateListingSchema>;

/** `GET /marketplace/listings` — cursor offset (`core/utils/cursor.ts#decodeOffsetCursor`), tìm theo tiêu đề đã chuẩn hoá, lọc loại, sắp xếp. */
export const listingQuerySchema = cursorQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  contentType: z.enum(LISTING_CONTENT_TYPES).optional(),
  sort: z.enum(["new", "popular", "price"]).default("new"),
});
export type ListingQueryDto = z.infer<typeof listingQuerySchema>;

/** `POST /marketplace/listings/:id/report` — `reason=OTHER` không bắt buộc mô tả (khác `moderation` p1-08, chợ có bộ lý do riêng gọn hơn). */
export const reportListingSchema = z.object({
  reason: z.enum(LISTING_REPORT_REASONS),
  description: z.string().trim().max(500).optional(),
});
export type ReportListingDto = z.infer<typeof reportListingSchema>;

/** Params `/marketplace/listings/:id`, `/admin/economy/listings/:id/*`. */
export const listingIdParamSchema = idParamSchema;

/** `POST /admin/economy/listings/:id/approve|reject|hide|restore` — lý do bắt buộc + audit (be.md §4). */
export const listingActionSchema = reasonSchema;
export type ListingActionDto = z.infer<typeof listingActionSchema>;
