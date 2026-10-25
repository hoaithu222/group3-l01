import { z } from 'zod';

import { newPasswordSchema } from '@/core/api/auth/password-policy';

/**
 * Schema của màn "Đổi mật khẩu" (p0-01 mục 10).
 *
 * Luật mật khẩu MỚI lấy từ `core/api/auth/password-policy` — cùng nguồn với đăng ký/đặt lại, để
 * `features/me` và `features/auth` (không được nhập chéo nhau) không lệch luật.
 *
 * `currentPassword` chỉ kiểm "đã nhập chưa": mật khẩu hiện tại có thể đặt từ trước khi luật độ mạnh
 * ra đời, và đúng/sai là việc của máy chủ.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: newPasswordSchema,
    confirmPassword: z.string().min(1),
  })
  // Lỗi gắn vào ĐÚNG ô cần sửa (`path`), không nổi lên đầu form nơi bàn phím đang che.
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'Mật khẩu nhập lại không khớp',
    path: ['confirmPassword'],
  })
  // BE cũng từ chối (400) — chặn ở đây để khỏi tốn một lượt gọi và hiện lỗi ngay dưới ô.
  .refine((values) => values.newPassword !== values.currentPassword, {
    message: 'Mật khẩu mới phải khác mật khẩu hiện tại',
    path: ['newPassword'],
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
