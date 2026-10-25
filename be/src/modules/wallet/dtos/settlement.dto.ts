import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { objectIdSchema, cursorQuerySchema } from "../../../shared/dto/common-schemas";
import { moneySchema } from "./money.schemas";
import { SETTLEMENT_CODE_PATTERN } from "../domain/vietqr-reference";

export const createSettlementSchema = z.object({
  toId: objectIdSchema,
  amount: moneySchema,
  method: z.enum(["CASH", "BANK", "OTHER"]),
  proofAssetId: objectIdSchema.optional(),
  note: z.string().trim().max(LIMITS.wallet.settlementNoteMax).optional(),
  /** Mã đã cấp cho người gửi ở `payment-info` (nội dung CK `SA <mã>`) — bỏ trống thì hệ thống tự sinh. */
  reference: z.string().regex(SETTLEMENT_CODE_PATTERN, "Mã tham chiếu không hợp lệ").optional(),
});
export type CreateSettlementDto = z.infer<typeof createSettlementSchema>;

export const rejectSettlementSchema = z.object({ reason: z.string().trim().min(3).max(LIMITS.wallet.settlementNoteMax) });
export type RejectSettlementDto = z.infer<typeof rejectSettlementSchema>;

export const listSettlementsQuerySchema = cursorQuerySchema.extend({
  status: z.enum(["PENDING", "CONFIRMED", "REJECTED", "CANCELLED"]).optional(),
  /** `true` = chỉ settlement có tôi là người gửi hoặc người nhận. */
  mine: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});
export type ListSettlementsQueryDto = z.infer<typeof listSettlementsQuerySchema>;

export const payeeParamsSchema = z.object({ workspaceId: objectIdSchema, userId: objectIdSchema });

export const workspaceParamsSchema = z.object({ workspaceId: objectIdSchema });

export const exportQuerySchema = z.object({ kind: z.enum(["expenses", "settlements"]).default("expenses") });
