import { z } from "zod";
import { nonceSchema, phoneSchema } from "../../../shared/dto/common-schemas";

/**
 * Email luôn được CẮT khoảng trắng + CHỮ THƯỜNG ngay ở DTO (RFC 5321 giới hạn
 * 254 ký tự): `User.email` unique nhưng Mongo so khớp phân biệt hoa/thường,
 * không chuẩn hoá thì `Foo@x.com` và `foo@x.com` thành hai tài khoản khác nhau.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Email không hợp lệ")
  .max(254, "Email tối đa 254 ký tự");

/** bcrypt chỉ dùng 72 byte đầu — trần 128 ký tự chặn payload phình to vô nghĩa (DoS băm mật khẩu). */
const PASSWORD_MAX = 128;

/** Mật khẩu ĐẶT MỚI (đăng ký / đặt lại) — tối thiểu 8 ký tự (p0-01 be.md §3, NIST 800-63B). */
export const newPasswordSchema = z
  .string()
  .min(8, "Mật khẩu tối thiểu 8 ký tự")
  .max(PASSWORD_MAX, `Mật khẩu tối đa ${PASSWORD_MAX} ký tự`);

export const loginSchema = z.object({
  email: emailSchema,
  // Đăng nhập KHÔNG áp luật độ mạnh — tài khoản cũ có thể có mật khẩu ngắn hơn luật hiện tại.
  password: z
    .string()
    .min(1, "Mật khẩu không được để trống")
    .max(PASSWORD_MAX, `Mật khẩu tối đa ${PASSWORD_MAX} ký tự`),
  nonce: nonceSchema,
});

/**
 * Đăng nhập mạng xã hội: `idToken` là Firebase ID token (JWT ~1–1,5 KB) sau khi app đăng nhập Google qua Firebase Auth. Chỉ nhận token —
 * KHÔNG nhận email/tên từ client (mọi thông tin danh tính lấy từ token đã được Firebase ký).
 */
export const firebaseLoginSchema = z
  .object({
    idToken: z.string().min(20, "ID token không hợp lệ").max(4096, "ID token không hợp lệ"),
    nonce: nonceSchema,
  })
  .strict();

/**
 * KHÔNG nhận `role` — đăng ký công khai LUÔN tạo `ROLES.USER`, không cho phép
 * client tự đặt vai trò của mình. `.strict()` khiến gửi `role` (hay bất kỳ
 * field lạ nào) → 400 VAL_001 thay vì âm thầm bỏ qua.
 */
export const registerSchema = z
  .object({
    email: emailSchema,
    name: z.string().trim().min(1, "Tên không được để trống").max(80, "Tên tối đa 80 ký tự"),
    password: newPasswordSchema,
    /**
     * Số điện thoại TUỲ CHỌN (tự khai, chưa xác minh) để người khác tìm/thêm vào nhóm. Chuỗi rỗng coi như không gửi (form di động
     * để trống ô); sai hình dạng → 400 `VAL_001`. Được chuẩn hoá E.164 ngay ở đây.
     */
    phone: z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), phoneSchema.optional()),
    nonce: nonceSchema,
  })
  .strict();

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token không được để trống").max(4096),
});

/** Schema cho yêu cầu quên mật khẩu */
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

/** Schema cho đặt lại mật khẩu */
export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token không được để trống").max(256, "Token không hợp lệ"),
  newPassword: newPasswordSchema,
});

export type LoginDto = z.infer<typeof loginSchema>;
export type RegisterDto = z.infer<typeof registerSchema>;
export type FirebaseLoginDto = z.infer<typeof firebaseLoginSchema>;
export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
