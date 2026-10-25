import { z } from "zod";
import { objectIdSchema, reasonSchema } from "../../../shared/dto/common-schemas";

/**
 * Schema riêng cho admin xem/thu hồi credential sinh trắc học của 1 user
 * (p0-13). KHÔNG import từ `modules/auth/dtos/biometric.dto.ts` — giữ đúng
 * ranh giới "modules/users không import modules/auth".
 */
export const adminCredentialParamsSchema = z.object({
  id: objectIdSchema,
  credentialId: objectIdSchema,
});

export const adminListCredentialsQuerySchema = z.object({
  status: z.enum(["ACTIVE", "REVOKED", "ALL"]).optional().default("ACTIVE"),
});
export type AdminListCredentialsQuery = z.infer<typeof adminListCredentialsQuerySchema>;

/** Body thu hồi (admin) — dùng chung `reasonSchema` ({ reason }). */
export const adminRevokeBiometricSchema = reasonSchema;
