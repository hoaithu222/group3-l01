import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { cursorQuerySchema } from "../../../shared/dto/common-schemas";
import { PRINT_ORDER_STATUSES } from "../entities/o2o.interface";
import { PIN_PATTERN } from "../domain/pickup-pin";

const O2O = LIMITS.o2o;

/** `GET /partner/orders?status=PENDING,ACCEPTED&cursor` — hàng đợi của tiệm tôi (không PIN, không tệp). */
export const partnerOrdersQuerySchema = cursorQuerySchema.extend({
  status: z
    .string()
    .max(200)
    .transform((raw) => raw.split(",").map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.enum(PRINT_ORDER_STATUSES)).min(1).max(PRINT_ORDER_STATUSES.length))
    .optional(),
});
export type PartnerOrdersQueryDto = z.infer<typeof partnerOrdersQuerySchema>;

export const partnerRejectSchema = z.object({
  reason: z.string().trim().min(O2O.rejectReasonMin).max(O2O.rejectReasonMax),
});
export type PartnerRejectDto = z.infer<typeof partnerRejectSchema>;

/** Giao hàng bằng PIN (be.md §3 `pickupSchema`) — `markPaid` = đã thu tiền tại quầy (D-11 bước 1). */
export const pickupSchema = z.object({
  pin: z.string().regex(PIN_PATTERN, "PIN gồm 6 chữ số"),
  markPaid: z.boolean().default(true),
});
export type PickupDto = z.infer<typeof pickupSchema>;

/** `POST /partner/shops/:id/accepting` (admin.md §2.4 — endpoint bổ sung). */
export const acceptingSchema = z.object({ acceptingOrders: z.boolean() });
export type AcceptingDto = z.infer<typeof acceptingSchema>;
