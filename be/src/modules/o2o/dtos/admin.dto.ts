import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { objectIdSchema, paginationSchema, phoneSchema, reasonSchema } from "../../../shared/dto/common-schemas";
import { normalizeEmail } from "../../../core/auth/normalize-email";
import { LOCATION_STATUSES, LOCATION_TYPES, PRINT_ORDER_STATUSES, PRINT_SHOP_STATUSES } from "../entities/o2o.interface";
import { isValidOpenHour } from "../domain/open-hours";
import { AMENITY_CODES } from "./location.dto";

const O2O = LIMITS.o2o;

const openHourSchema = z
  .object({ day: z.number().int().min(0).max(6), open: z.string(), close: z.string() })
  .refine(isValidOpenHour, { message: "Giờ mở cửa không hợp lệ (HH:mm, giờ đóng phải sau giờ mở)" });

const locationFields = {
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().min(3).max(300),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  type: z.enum(LOCATION_TYPES),
  amenities: z.array(z.enum(AMENITY_CODES)).max(AMENITY_CODES.length).default([]),
  openHours: z.array(openHourSchema).max(O2O.openHoursMax).default([]),
  photoAssetIds: z.array(objectIdSchema).max(O2O.photosMax).default([]),
};

/** `POST /admin/locations` (be.md §3 `adminLocationSchema`). */
export const adminLocationSchema = z.object(locationFields);
export type AdminLocationDto = z.infer<typeof adminLocationSchema>;

/** `PATCH /admin/locations/:id` — chỉ trường gửi lên, CAS `expectedVersion`. */
export const adminLocationUpdateSchema = z
  .object({
    name: locationFields.name.optional(),
    address: locationFields.address.optional(),
    lat: locationFields.lat.optional(),
    lng: locationFields.lng.optional(),
    type: locationFields.type.optional(),
    amenities: z.array(z.enum(AMENITY_CODES)).max(AMENITY_CODES.length).optional(),
    openHours: z.array(openHourSchema).max(O2O.openHoursMax).optional(),
    photoAssetIds: z.array(objectIdSchema).max(O2O.photosMax).optional(),
    expectedVersion: z.number().int().min(0),
  })
  .refine((d) => (d.lat === undefined) === (d.lng === undefined), { message: "Cần gửi cả vĩ độ và kinh độ", path: ["lat"] });
export type AdminLocationUpdateDto = z.infer<typeof adminLocationUpdateSchema>;

export const adminLocationsQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  type: z.enum(LOCATION_TYPES).optional(),
  status: z.enum(LOCATION_STATUSES).optional(),
  amenity: z.enum(AMENITY_CODES).optional(),
});
export type AdminLocationsQueryDto = z.infer<typeof adminLocationsQuerySchema>;

export const priceTableSchema = z.object({
  a4Bw: z.number().int().min(0).max(1_000_000),
  a4Color: z.number().int().min(0).max(1_000_000),
  a3Bw: z.number().int().min(0).max(1_000_000),
  a3Color: z.number().int().min(0).max(1_000_000),
  duplexDiscountPct: z.number().int().min(0).max(100),
  minOrder: z.number().int().min(0).max(10_000_000),
});

export const capabilitiesSchema = z.object({ color: z.boolean(), duplex: z.boolean(), a3: z.boolean(), binding: z.boolean() });

/** `POST /admin/print-shops` (be.md §3 `adminShopSchema`) — chủ tiệm tra theo email (O2O_009 nếu không có). */
export const adminShopSchema = z.object({
  locationId: objectIdSchema,
  ownerEmail: z.string().trim().email().max(254).transform(normalizeEmail),
  displayName: z.string().trim().min(2).max(120),
  phone: phoneSchema.nullable().optional(),
  priceTable: priceTableSchema,
  capabilities: capabilitiesSchema,
});
export type AdminShopDto = z.infer<typeof adminShopSchema>;

/** `PATCH /admin/print-shops/:id` — đổi bảng giá/năng lực cần lý do (audit) và KHÔNG ảnh hưởng đơn đã gửi (IR-15). */
export const adminShopUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  phone: phoneSchema.nullable().optional(),
  priceTable: priceTableSchema.optional(),
  capabilities: capabilitiesSchema.optional(),
  acceptingOrders: z.boolean().optional(),
  reason: z.string().trim().min(3).max(500).optional(),
  expectedVersion: z.number().int().min(0),
});
export type AdminShopUpdateDto = z.infer<typeof adminShopUpdateSchema>;

export const adminShopsQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(PRINT_SHOP_STATUSES).optional(),
});
export type AdminShopsQueryDto = z.infer<typeof adminShopsQuerySchema>;

export const adminOrdersQuerySchema = paginationSchema.extend({
  shopId: objectIdSchema.optional(),
  status: z.enum(PRINT_ORDER_STATUSES).optional(),
  paymentStatus: z.enum(["UNPAID", "PAID"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().trim().max(20).optional(),
});
export type AdminOrdersQueryDto = z.infer<typeof adminOrdersQuerySchema>;

/** Ẩn địa điểm / duyệt / tạm ngưng tiệm / huỷ đơn (vận hành) — lý do bắt buộc (≥ 10 ký tự, audit). */
export const adminReasonSchema = reasonSchema;
export type AdminReasonDto = z.infer<typeof adminReasonSchema>;
