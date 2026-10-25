import { z } from "zod";

export const confirmEmailSchema = z.object({
  code: z.string().length(6, "Mã xác minh phải có 6 chữ số").regex(/^\d{6}$/, "Mã xác minh chỉ chứa số"),
});

export type ConfirmEmailDto = z.infer<typeof confirmEmailSchema>;
