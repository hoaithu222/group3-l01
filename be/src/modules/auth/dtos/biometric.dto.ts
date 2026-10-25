import { z } from "zod";
import { objectIdSchema, reasonSchema, nonceSchema } from "../../../shared/dto/common-schemas";

export const biometryKindSchema = z.enum(["FACE", "FINGERPRINT", "IRIS", "GENERIC"]);
export const mobilePlatformSchema = z.enum(["ANDROID", "IOS"]);
/** Khớp `registerDeviceSchema` (p0-06) — id thiết bị app tự sinh 1 lần/cài đặt. */
export const deviceIdSchema = z.string().trim().min(8).max(64);

export const biometricEnrollSchema = z
  .object({
    password: z.string().min(1).max(128),
    deviceId: deviceIdSchema,
    platform: mobilePlatformSchema,
    deviceName: z.string().trim().max(80).optional(),
    biometryKind: biometryKindSchema,
  })
  .strict();
export type BiometricEnrollDto = z.infer<typeof biometricEnrollSchema>;

/**
 * Đăng nhập sinh trắc học — nonce + HMAC (KHÔNG gửi bí mật thô ở lần đăng
 * nhập, chỉ enroll trả bí mật thô 1 lần). Client tính
 * `hmac = HMAC-SHA256(secret, nonce)` bằng bí mật đã lưu cục bộ; server so
 * với `HMAC-SHA256(secretHash, nonce)` (đối xứng, không cần biết lại secret
 * gốc). `nonce` tiêu thụ qua `requireNonce()` TRƯỚC khi vào service.
 */
export const biometricLoginSchema = z
  .object({
    credentialId: objectIdSchema,
    deviceId: deviceIdSchema,
    nonce: nonceSchema,
    hmac: z.string().regex(/^[a-f0-9]{64}$/, "HMAC không hợp lệ"),
  })
  .strict();
export type BiometricLoginDto = z.infer<typeof biometricLoginSchema>;

export const credentialIdParamsSchema = z.object({ id: objectIdSchema });
export const adminCredentialParamsSchema = z.object({
  id: objectIdSchema,
  credentialId: objectIdSchema,
});
/** Body thu hồi (admin) — dùng chung `reasonSchema` ({ reason }). */
export const adminRevokeBiometricSchema = reasonSchema;

/** Query param thu hồi tự thân (`?reason=`) — giới hạn 2 giá trị theo be.md §5.6. */
export const revokeMineQuerySchema = z.object({
  reason: z.enum(["USER_DISABLED", "ACCOUNT_SWITCHED"]).optional().default("USER_DISABLED"),
});

/** Query admin list — mặc định chỉ ACTIVE. */
export const adminListCredentialsQuerySchema = z.object({
  status: z.enum(["ACTIVE", "REVOKED", "ALL"]).optional().default("ACTIVE"),
});
