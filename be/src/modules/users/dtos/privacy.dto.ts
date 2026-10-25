import { z } from "zod";

/**
 * `PATCH /me/privacy` (be.md §3/§4) — cập nhật từng phần `User.privacy`.
 * Các field đều optional nhưng phải gửi ÍT NHẤT 1 field (tránh request rỗng vô nghĩa).
 */
export const privacySchema = z
  .object({
    readReceipts: z.boolean().optional(),
    showPresence: z.boolean().optional(),
    showInLeaderboard: z.boolean().optional(),
    showGamification: z.boolean().optional(),
    /** Cho người khác tìm thấy tôi bằng email đầy đủ / số điện thoại (thêm thành viên, tìm người). */
    findableByEmail: z.boolean().optional(),
    findableByPhone: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Cần ít nhất 1 trường để cập nhật",
  });

export type PrivacyDto = z.infer<typeof privacySchema>;
