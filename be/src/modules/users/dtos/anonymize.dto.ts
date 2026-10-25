import { z } from "zod";
import { reasonSchema } from "../../../shared/dto/common-schemas";

/**
 * `POST /admin/users/:id/anonymize` (be.md §3/§4). `confirmEmail` bắt buộc
 * khi `mode: "NOW"` (refine cuối).
 *
 * NOTE: be.md viết pseudo-code `reason: reasonSchema` nhưng `reasonSchema`
 * thật trong repo là `z.object({ reason })` (đã có field `reason` bên trong,
 * xem `shared/dto/common-schemas.ts`) — dùng `.merge()` để có shape phẳng
 * `{ mode, reason, confirmEmail? }` thay vì lồng object bên trong object.
 */
export const anonymizeSchema = z
  .object({
    mode: z.enum(["GRACE", "NOW"]),
    confirmEmail: z.string().trim().toLowerCase().email("Email không hợp lệ").optional(),
  })
  .merge(reasonSchema)
  .refine((v) => v.mode === "GRACE" || !!v.confirmEmail, {
    message: "Cần xác nhận đúng email tài khoản khi ẩn danh hoá ngay lập tức",
    path: ["confirmEmail"],
  });

export type AnonymizeDto = z.infer<typeof anonymizeSchema>;
