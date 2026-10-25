import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { objectIdSchema } from "../../../shared/dto/common-schemas";
import { weeklyCronSchema, ianaTzSchema } from "./money.schemas";

export const walletSettingsSchema = z
  .object({
    reminderEnabled: z.boolean(),
    reminderCron: weeklyCronSchema,
    timezone: ianaTzSchema,
    reminderTargetType: z.enum(["NONE", "CONVERSATION", "CHANNEL"]),
    reminderTargetId: objectIdSchema.nullable().optional(),
    reminderMinDebt: z.number().int().min(0).max(LIMITS.wallet.reminderMinDebtMax),
    expectedVersion: z.number().int().min(1),
  })
  .superRefine((data, ctx) => {
    const needsTarget = data.reminderTargetType !== "NONE";
    if (needsTarget && !data.reminderTargetId) {
      ctx.addIssue({ code: "custom", path: ["reminderTargetId"], message: "Cần chọn nơi đăng nhắc" });
    }
    if (!needsTarget && data.reminderTargetId) {
      ctx.addIssue({ code: "custom", path: ["reminderTargetId"], message: "Không chọn nơi đăng thì bỏ trống" });
    }
  });
export type WalletSettingsDto = z.infer<typeof walletSettingsSchema>;
