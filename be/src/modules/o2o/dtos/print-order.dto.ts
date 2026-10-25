import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { cursorQuerySchema, objectIdSchema } from "../../../shared/dto/common-schemas";
import { PAPER_SIZES } from "../entities/o2o.interface";
import { PAGE_RANGE_MAX_LENGTH } from "../domain/page-range";

const O2O = LIMITS.o2o;

/**
 * Cấu hình in (be.md §3 `printSettingsSchema`). `pageRange` chỉ kiểm độ dài ở đây — hình dạng + vượt số trang kiểm ở service
 * bằng `countPrintablePages` để mọi lỗi khoảng trang có CÙNG một mã `O2O_012` (app gắn vào ô nhập).
 */
export const printSettingsSchema = z.object({
  paper: z.enum(PAPER_SIZES),
  color: z.boolean(),
  copies: z.number().int().min(1).max(O2O.copiesMax),
  duplex: z.boolean(),
  pageRange: z.string().trim().max(PAGE_RANGE_MAX_LENGTH).nullable().optional(),
  binding: z.boolean().default(false),
});
export type PrintSettingsDto = z.infer<typeof printSettingsSchema>;

const pickupBySchema = z.coerce.date().nullable().optional();

/** `POST /print-orders` — nguồn tệp: tài liệu Resource Hub (snapshot asset hiện tại) hoặc PDF tự tải lên (scope PRINT). */
export const createOrderSchema = z.object({
  shopId: objectIdSchema,
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("RESOURCE"), resourceId: objectIdSchema }),
    z.object({ kind: z.literal("UPLOAD"), assetId: objectIdSchema }),
  ]),
  settings: printSettingsSchema.optional(),
  pickupBy: pickupBySchema,
});
export type CreateOrderDto = z.infer<typeof createOrderSchema>;

/** `PATCH /print-orders/:id` — chỉ khi DRAFT/QUOTED; báo giá tính lại ở server. */
export const updateOrderSchema = z.object({
  settings: printSettingsSchema,
  pickupBy: pickupBySchema,
  expectedVersion: z.number().int().min(0),
});
export type UpdateOrderDto = z.infer<typeof updateOrderSchema>;

/** `POST /print-shops/:id/quote` — báo giá thử (không lưu). */
export const quoteSchema = z.object({
  pages: z.number().int().min(1).max(O2O.orderPagesMax),
  settings: printSettingsSchema,
});
export type QuoteDto = z.infer<typeof quoteSchema>;

export const cancelOrderSchema = z.object({
  reason: z.string().trim().max(O2O.rejectReasonMax).optional(),
});
export type CancelOrderDto = z.infer<typeof cancelOrderSchema>;

/** Nhóm trạng thái cho "Đơn của tôi" (app.md §3): đang xử lý / hoàn tất / đã đóng. */
export const ORDER_GROUPS = ["ACTIVE", "DONE", "CLOSED"] as const;
export type OrderGroup = (typeof ORDER_GROUPS)[number];

export const myOrdersQuerySchema = cursorQuerySchema.extend({
  group: z.enum(ORDER_GROUPS).optional(),
});
export type MyOrdersQueryDto = z.infer<typeof myOrdersQuerySchema>;
