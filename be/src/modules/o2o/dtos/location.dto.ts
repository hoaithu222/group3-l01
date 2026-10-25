import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { booleanQuerySchema, cursorQuerySchema } from "../../../shared/dto/common-schemas";
import { LOCATION_TYPES } from "../entities/o2o.interface";

const O2O = LIMITS.o2o;
export const AMENITY_CODES = O2O.amenities;

/** "wifi_fast,quiet_zone" → mảng mã tiện ích đã biết (mã lạ → 400). */
const amenitiesCsvSchema = z
  .string()
  .max(200)
  .transform((raw) => raw.split(",").map((s) => s.trim()).filter(Boolean))
  .pipe(z.array(z.enum(AMENITY_CODES)).max(AMENITY_CODES.length));

/** `GET /locations/near` (be.md §3 `nearQuery`). Toạ độ người dùng CHỈ dùng trong truy vấn — không lưu (README §2). */
export const nearQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusM: z.coerce.number().int().min(O2O.radiusMinM).max(O2O.radiusMaxM).default(O2O.radiusDefaultM),
  type: z.enum(LOCATION_TYPES).optional(),
  amenities: amenitiesCsvSchema.optional(),
  openNow: booleanQuerySchema.optional(),
  limit: z.coerce.number().int().min(1).max(O2O.nearLimit).default(O2O.nearLimit),
});
export type NearQueryDto = z.infer<typeof nearQuerySchema>;

/** `PUT /locations/:id/reviews/me` — một người một đánh giá mỗi địa điểm (ghi đè). */
export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  noise: z.number().int().min(1).max(5),
  comment: z.string().trim().max(O2O.reviewCommentMax).optional(),
});
export type ReviewDto = z.infer<typeof reviewSchema>;

export const reviewsQuerySchema = cursorQuerySchema;
export type ReviewsQueryDto = z.infer<typeof reviewsQuerySchema>;
