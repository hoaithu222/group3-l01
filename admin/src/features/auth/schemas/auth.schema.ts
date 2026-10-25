/**
 * @file auth.schema.ts
 * @description Zod v4 schemas cho form validation phía FE.
 *
 * Ràng buộc mật khẩu bám ĐÚNG từng endpoint BE (`be/src/modules/auth/dtos`): đăng ký và đặt
 * lại mật khẩu 8–128 ký tự (`newPasswordSchema`), đổi mật khẩu thêm có chữ cái + có chữ số.
 * Mật khẩu KHÔNG `.trim()` — khoảng trắng là ký tự hợp lệ (`docs/rules/form-validation.md §2`).
 */

import { z } from 'zod';

/** Mật khẩu ĐẶT MỚI khi đăng ký / đặt lại — khớp `newPasswordSchema` của BE (p0-01 be.md §3). */
const newPassword = z
  .string()
  .min(8, 'Mật khẩu tối thiểu 8 ký tự')
  .max(128, 'Mật khẩu tối đa 128 ký tự');

// ─── Login ────────────────────────────────────────────────────────────────────

/**
 * ⛔ Mật khẩu đăng nhập CHỈ kiểm "không rỗng" (khớp `loginSchema` của BE), KHÔNG kiểm độ
 * dài tối thiểu: form đăng nhập không phải nơi áp chính sách mật khẩu — kiểm ở đây chặn
 * người có mật khẩu cũ ngắn hơn ngưỡng mới, và để lộ chính sách mật khẩu cho người lạ.
 */
export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email không được để trống').email('Email không đúng định dạng'),
  password: z.string().min(1, 'Mật khẩu không được để trống'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

// ─── Register ─────────────────────────────────────────────────────────────────

export const registerSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, 'Email không được để trống')
      .email('Email không đúng định dạng'),
    name: z.string().trim().min(1, 'Tên không được để trống'),
    password: newPassword,
    confirmPassword: z.string().min(1, 'Vui lòng nhập lại mật khẩu'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirmPassword'],
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;

// ─── Forgot Password ──────────────────────────────────────────────────────────

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, 'Email không được để trống').email('Email không đúng định dạng'),
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

// ─── Reset Password ───────────────────────────────────────────────────────────

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Token không hợp lệ'),
    password: newPassword,
    confirmPassword: z.string().min(1, 'Vui lòng nhập lại mật khẩu'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirmPassword'],
  });

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

// ─── Change Password ──────────────────────────────────────────────────────────

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Vui lòng nhập mật khẩu hiện tại'),
    newPassword: z
      .string()
      .min(8, 'Mật khẩu mới tối thiểu 8 ký tự')
      .max(128, 'Mật khẩu mới tối đa 128 ký tự')
      .regex(/[a-zA-Z]/, 'Mật khẩu mới phải có ít nhất 1 chữ cái')
      .regex(/\d/, 'Mật khẩu mới phải có ít nhất 1 chữ số'),
    confirmPassword: z.string().min(1, 'Vui lòng nhập lại mật khẩu mới'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirmPassword'],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: 'Mật khẩu mới phải khác mật khẩu hiện tại',
    path: ['newPassword'],
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
