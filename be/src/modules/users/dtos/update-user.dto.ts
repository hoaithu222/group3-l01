import { z } from "zod";
import { ROLE_LIST } from "../../../core/constants";
import { objectIdSchema } from "../../../shared/dto/common-schemas";
import { userEmailSchema, userPasswordSchema } from "./create-user.dto";

export const updateUserSchema = z.object({
  email: userEmailSchema.optional(),
  name: z.string().trim().min(1, "Tên không được để trống").max(80, "Tên tối đa 80 ký tự").optional(),
  role: z.enum(ROLE_LIST as [string, ...string[]]).optional(),
  password: userPasswordSchema.optional(),
  /**
   * Mật khẩu HIỆN TẠI — BẮT BUỘC khi người dùng tự đổi `password`/`email` của CHÍNH MÌNH qua route này (kể cả admin có `user:update`); bỏ qua khi quản trị sửa người khác.
   * Không bao giờ được lưu. Thiếu → 400 `AUTH_021`; sai → 401 `AUTH_001` (đếm lần sai theo tài khoản, 429 `RATE_002` khi vượt ngưỡng).
   */
  currentPassword: z.string().min(1, "Mật khẩu hiện tại không được để trống").max(128).optional(),
  /** Ảnh đại diện (p0-01 §5.6): id asset `READY` scope `AVATAR` của CHÍNH người dùng; `null` = gỡ ảnh. Đi qua `UserAvatarService`, không ghi thẳng repository. */
  avatarAssetId: objectIdSchema.nullable().optional(),
});

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
