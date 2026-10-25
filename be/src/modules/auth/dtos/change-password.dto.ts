import { z } from "zod";
import { newPasswordSchema } from "./auth.dto";

/**
 * Đổi mật khẩu khi đang đăng nhập. `newPassword` dùng CHUNG luật với đăng ký/đặt lại/admin đặt (`newPasswordSchema`: 8–128 ký tự,
 * p0-01 be.md §3, NIST 800-63B — không bắt buộc "có chữ + có số"): trước đây đổi mật khẩu đòi thêm chữ + số còn đăng ký/đặt lại thì không,
 * nên người dùng đăng ký được mật khẩu mà không đổi sang được mật khẩu tương tự. Client (app/admin) đã dùng luật 8–128.
 */
export const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, "Mật khẩu hiện tại không được để trống")
    .max(128, "Mật khẩu tối đa 128 ký tự"),
  newPassword: newPasswordSchema,
  /**
   * Refresh token của PHIÊN HIỆN TẠI (tuỳ chọn) — app không có cookie nên gửi
   * ở đây để BE giữ phiên này khi thu hồi các phiên khác. Thiếu ⇒ BE dùng
   * `sid` trong access token; không xác định được gì thì thu hồi TẤT CẢ.
   */
  refreshToken: z.string().min(1).max(4096).optional(),
});

export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;
