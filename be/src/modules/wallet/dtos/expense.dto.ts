import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { objectIdSchema, cursorQuerySchema } from "../../../shared/dto/common-schemas";
import { moneySchema, categorySchema } from "./money.schemas";

const participantSchema = z.object({
  userId: objectIdSchema,
  amount: z.number().int().min(0).max(LIMITS.wallet.expenseMax).optional(),
  bps: z.number().int().min(0).max(10_000).optional(),
});

const splitTypeSchema = z.enum(["EQUAL", "CUSTOM", "PERCENT"]);
type ParticipantInput = z.infer<typeof participantSchema>;

/**
 * Kiểm CẤU TRÚC chia tiền (userId duy nhất; EQUAL không kèm amount/bps; CUSTOM cần
 * amount mọi người; PERCENT cần bps mọi người). CỐ Ý không kiểm TỔNG ở đây: tổng
 * lệch phải ra `WALLET_002` (be.md §4) chứ không phải 400 `VAL_001` chung — service kiểm.
 */
export function refineSplitShape(
  data: { splitType?: "EQUAL" | "CUSTOM" | "PERCENT"; participants?: ParticipantInput[] },
  ctx: z.RefinementCtx
): void {
  const { splitType, participants } = data;
  if (!participants) return;
  const ids = new Set(participants.map((p) => p.userId));
  if (ids.size !== participants.length) {
    ctx.addIssue({ code: "custom", path: ["participants"], message: "Người tham gia bị trùng" });
  }
  if (!splitType) return;
  participants.forEach((p, i) => {
    const bad =
      (splitType === "EQUAL" && (p.amount !== undefined || p.bps !== undefined)) ||
      (splitType === "CUSTOM" && (p.amount === undefined || p.bps !== undefined)) ||
      (splitType === "PERCENT" && (p.bps === undefined || p.amount !== undefined));
    if (bad) ctx.addIssue({ code: "custom", path: ["participants", i], message: "Dữ liệu chia không khớp kiểu chia" });
  });
}

const expenseBaseShape = {
  amount: moneySchema,
  description: z.string().trim().min(1).max(LIMITS.wallet.descriptionMax),
  category: categorySchema,
  paidBy: objectIdSchema,
  occurredAt: z.coerce.date(),
  receiptAssetId: objectIdSchema.optional(),
  splitType: splitTypeSchema,
  participants: z.array(participantSchema).min(1).max(LIMITS.wallet.participantsMax),
};

export const createExpenseSchema = z.object(expenseBaseShape).superRefine(refineSplitShape);
export type CreateExpenseDto = z.infer<typeof createExpenseSchema>;

/** PATCH: mọi field tuỳ chọn; đổi `amount`/`splitType`/`participants` thì service kiểm lại tổng sau khi hợp nhất với bản hiện có. */
export const updateExpenseSchema = z
  .object({ ...expenseBaseShape, receiptAssetId: objectIdSchema.nullable().optional() })
  .partial()
  .extend({ expectedVersion: z.number().int().min(1) })
  .superRefine(refineSplitShape);
export type UpdateExpenseDto = z.infer<typeof updateExpenseSchema>;

/** `POST /expenses/:id/adjustments` — bản khai ĐÚNG mới của khoản chi; hệ thống tính chênh lệch so với hiệu lực hiện tại. */
export const createAdjustmentSchema = z
  .object({
    amount: moneySchema,
    description: z.string().trim().min(1).max(LIMITS.wallet.descriptionMax),
    splitType: splitTypeSchema,
    participants: z.array(participantSchema).min(1).max(LIMITS.wallet.participantsMax),
  })
  .superRefine(refineSplitShape);
export type CreateAdjustmentDto = z.infer<typeof createAdjustmentSchema>;

export const listExpensesQuerySchema = cursorQuerySchema.extend({
  userId: objectIdSchema.optional(),
  category: categorySchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ListExpensesQueryDto = z.infer<typeof listExpensesQuerySchema>;
