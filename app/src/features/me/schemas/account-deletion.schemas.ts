import { z } from 'zod';

/**
 * Schema kiểm dữ liệu riêng của "Xoá tài khoản (ân hạn)" (p0-01 mục 10).
 *
 * Bản cũ còn `cancelAccountDeletionSchema` (email + mật khẩu) cho sheet huỷ ngay trong app — đã bỏ:
 * BE thu hồi mọi phiên khi nhận yêu cầu xoá nên việc huỷ nằm ở màn "Khôi phục tài khoản" của
 * `features/auth` (dùng `loginSchema`), xem `useAccountDeletion.ts`.
 */

/** Mật khẩu XÁC NHẬN lại — chỉ kiểm "đã nhập chưa", như mọi ô mật khẩu ĐĂNG NHẬP khác trong base. */
const password = z.string().min(1);

export const deleteAccountRequestSchema = z.object({ password });
export type DeleteAccountRequestFormValues = z.infer<typeof deleteAccountRequestSchema>;
