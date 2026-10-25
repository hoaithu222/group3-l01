import { z } from "zod";

export const paymentProfileSchema = z.object({
  bankBin: z.string().regex(/^\d{6}$/, "Mã ngân hàng gồm 6 chữ số"),
  accountNumber: z.string().regex(/^\d{6,19}$/, "Số tài khoản gồm 6–19 chữ số"),
  /** Tên chủ TK IN HOA không dấu theo NAPAS — service chuẩn hoá lại, DTO chỉ giới hạn độ dài. */
  accountName: z.string().trim().min(2).max(50),
  isDefault: z.boolean().default(true),
});
export type PaymentProfileDto = z.infer<typeof paymentProfileSchema>;
