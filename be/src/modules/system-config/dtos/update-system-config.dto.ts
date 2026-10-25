import { z } from "zod";
import { expectedVersionSchema, reasonSchema } from "../../../shared/dto/common-schemas";

/** Khoá registry: `limits.message`, `features`, `auth`, ... (1 hoặc 2 đoạn, chữ thường). */
export const systemConfigKeyParamSchema = z.object({
  key: z.string().regex(/^[a-z]+(\.[a-zA-Z]+)?$/, "Khoá cấu hình không hợp lệ"),
});
export type SystemConfigKeyParam = z.infer<typeof systemConfigKeyParamSchema>;

// NOTE: be.md viết pseudo-code `expectedVersion: ...` + `reason: reasonSchema`
// nhưng cả 2 schema dùng chung đã LÀ object (`{ expectedVersion }`/`{ reason }`,
// xem `shared/dto/common-schemas.ts`) — `.merge()` để có shape phẳng, giống
// `users/dtos/anonymize.dto.ts`.
export const updateSystemConfigSchema = z
  .object({ value: z.record(z.unknown()) })
  .merge(expectedVersionSchema)
  .merge(reasonSchema);
export type UpdateSystemConfigDto = z.infer<typeof updateSystemConfigSchema>;

export const resetSystemConfigSchema = expectedVersionSchema.merge(reasonSchema);
export type ResetSystemConfigDto = z.infer<typeof resetSystemConfigSchema>;
