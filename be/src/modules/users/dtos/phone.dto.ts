import { z } from "zod";
import { phoneSchema } from "../../../shared/dto/common-schemas";

/**
 * `PATCH /me/phone` — đặt/đổi số điện thoại của CHÍNH MÌNH. `null` = xoá số. Đã chuẩn hoá E.164 (xem `phoneSchema`).
 * `.strict()`: field lạ → 400 thay vì âm thầm bỏ qua.
 */
export const updatePhoneSchema = z.object({ phone: phoneSchema.nullable() }).strict();

export type UpdatePhoneDto = z.infer<typeof updatePhoneSchema>;
