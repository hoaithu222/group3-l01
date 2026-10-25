import { z } from "zod";
import { cursorQuerySchema, objectIdSchema } from "../../../shared/dto/common-schemas";

export const messageParamsSchema = z.object({ messageId: objectIdSchema });
export const reminderParamsSchema = z.object({ id: objectIdSchema });

/** Đặt nhắc lại một tin. `remindAt` là thời điểm UTC; `timezone` IANA chỉ để hiển thị. Cửa sổ `[+1 phút, +365 ngày]` kiểm ở service (`REMIND_001`). */
export const createReminderSchema = z
  .object({
    remindAt: z.coerce.date(),
    timezone: z.string().min(1).max(64),
  })
  .strict();
export type CreateReminderDto = z.infer<typeof createReminderSchema>;

export const listMyRemindersQuerySchema = cursorQuerySchema.extend({
  status: z.enum(["PENDING", "FIRED"]).default("PENDING"),
});
export type ListMyRemindersQueryDto = z.infer<typeof listMyRemindersQuerySchema>;
