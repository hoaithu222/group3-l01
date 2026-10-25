import { z } from "zod";
import { objectIdSchema } from "../../../shared/dto/common-schemas";
import { PREFERENCE_SCOPES, PREFERENCE_MODES } from "../entities/notification.interface";
import { accountPreferenceSchema } from "./account-preference.dto";

export const getPreferenceQuerySchema = z.object({
  scope: z.enum(PREFERENCE_SCOPES).optional(),
  scopeId: objectIdSchema.optional(),
});
export type GetPreferenceQuery = z.infer<typeof getPreferenceQuerySchema>;

/** `scopeId` bắt buộc trừ `ACCOUNT` (kiểm ở service — Zod không biểu diễn "required trừ khi X" gọn bằng `.refine`). */
export const preferenceUpsertSchema = z
  .object({
    scope: z.enum(PREFERENCE_SCOPES),
    scopeId: objectIdSchema.optional(),
    mode: z.enum(PREFERENCE_MODES).optional(),
    mutedUntil: z.string().datetime().nullable().optional(),
    dndUntil: z.string().datetime().nullable().optional(),
    lockScreenPreview: z.boolean().optional(),
  })
  .refine((v) => v.scope === "ACCOUNT" || !!v.scopeId, {
    message: "scopeId bắt buộc trừ scope ACCOUNT",
    path: ["scopeId"],
  });
export type PreferenceUpsertDto = z.infer<typeof preferenceUpsertSchema>;

/** `PUT /me/notification-preferences` chấp nhận dạng MỚI (cấp tài khoản, không có `scope`) hoặc dạng CŨ p0-06 (có `scope`). */
export const preferenceBodySchema = z.union([accountPreferenceSchema, preferenceUpsertSchema]);
export type PreferenceBody = z.infer<typeof preferenceBodySchema>;

/** Body dạng cũ luôn có khoá `scope`. */
export function isLegacyPreferenceBody(body: PreferenceBody): body is PreferenceUpsertDto {
  return "scope" in body;
}
