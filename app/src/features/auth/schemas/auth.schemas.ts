import { z } from 'zod';

import { newPasswordSchema } from '@/core/api/auth/password-policy';

/**
 * Schema kiểm dữ liệu cho các màn hình xác thực.
 *
 * Thông báo lỗi mặc định đã là tiếng Việt nhờ `configureZodLocale()` (gọi ở
 * `AppProviders`), nên chỉ viết `message` cho những luật RIÊNG của nghiệp vụ.
 */

const email = z
  .string()
  .min(1)
  /**
   * ⛔ `.trim()` là bắt buộc, không phải cho đẹp.
   *
   * Bàn phím di động TỰ CHÈN một dấu cách sau khi người dùng nhận gợi ý tự động
   * hoàn thành — hành vi mặc định trên cả iOS lẫn Android. Không cắt thì
   * `"a@b.com "` trượt kiểm định dạng, và người dùng nhìn ô nhập thấy đúng y
   * nguyên nên không hiểu vì sao báo sai.
   */
  .trim()
  .toLowerCase()
  .email('Email không đúng định dạng');

/**
 * Mật khẩu lúc ĐĂNG NHẬP — chỉ kiểm "có nhập gì chưa".
 *
 * ⛔ KHÔNG áp luật độ mạnh ở đây. Người dùng cũ có thể có mật khẩu đặt từ trước
 * khi luật hiện tại ra đời; chặn ở client là họ KHÔNG đăng nhập được vào chính
 * tài khoản của mình, và không có cách nào tự thoát. Luật độ mạnh chỉ áp lúc
 * ĐẶT mật khẩu.
 */
const loginPassword = z.string().min(1);

export const loginSchema = z.object({
  email,
  password: loginPassword,
});

export const registerSchema = z
  .object({
    // ⛔ `.trim()` ĐỨNG TRƯỚC `.min(1)`: đảo lại thì tên toàn dấu cách qua được `min(1)` rồi mới bị
    // cắt thành rỗng và bị BE từ chối. Trần 80 khớp BE (`registerSchema.name`).
    name: z.string().trim().min(1).max(80, 'Tên tối đa 80 ký tự'),
    email,
    password: newPasswordSchema,
    confirmPassword: z.string().min(1),
  })
  /**
   * Gắn lỗi vào `confirmPassword` chứ không phải vào cả form: lỗi phải hiện
   * ngay DƯỚI ô mà người dùng cần sửa. Lỗi ở tầng form nổi lên đầu màn hình,
   * và trên điện thoại thì lúc đó bàn phím đang che mất — người dùng không
   * thấy gì cả và tưởng nút bấm hỏng.
   */
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Mật khẩu nhập lại không khớp',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    // ⛔ `.trim()`: mã DÁN từ e-mail thường kèm dấu cách/xuống dòng ở cuối — không cắt thì BE báo
    // "mã không hợp lệ" cho một mã hoàn toàn đúng. Trần 256 khớp BE.
    token: z.string().trim().min(1).max(256),
    password: newPasswordSchema,
    confirmPassword: z.string().min(1),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Mật khẩu nhập lại không khớp',
    path: ['confirmPassword'],
  });

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;
