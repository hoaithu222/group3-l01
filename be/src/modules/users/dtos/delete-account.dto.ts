import { z } from "zod";

/** `POST /me/delete-request` (be.md §4) — cần mật khẩu hiện tại để xác nhận. */
export const deleteRequestSchema = z.object({
  password: z.string().min(1, "Mật khẩu bắt buộc").max(128, "Mật khẩu tối đa 128 ký tự"),
});
export type DeleteRequestDto = z.infer<typeof deleteRequestSchema>;

/**
 * `POST /me/delete-cancel` (be.md §4) — tài khoản `PENDING_DELETION` bị chặn
 * đăng nhập (`AUTH_012`) nên request này KHÔNG có access token, phải tự xác
 * thực lại bằng `email + password`.
 */
export const deleteCancelSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email không hợp lệ").max(254),
  password: z.string().min(1, "Mật khẩu bắt buộc").max(128, "Mật khẩu tối đa 128 ký tự"),
});
export type DeleteCancelDto = z.infer<typeof deleteCancelSchema>;
