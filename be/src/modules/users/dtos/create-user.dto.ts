import { z } from "zod";
import { ROLE_LIST } from "../../../core/constants";

/** Email luôn cắt khoảng trắng + chữ thường (Mongo so khớp phân biệt hoa/thường; xem `normalizeEmail`). */
export const userEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Email không hợp lệ")
  .max(254, "Email tối đa 254 ký tự");

/** Mật khẩu do quản trị viên đặt: 8–128 ký tự (cùng luật với đăng ký/đặt lại). */
export const userPasswordSchema = z
  .string()
  .min(8, "Mật khẩu tối thiểu 8 ký tự")
  .max(128, "Mật khẩu tối đa 128 ký tự");

export const createUserSchema = z.object({
  email: userEmailSchema,
  name: z.string().trim().min(1, "Tên không được để trống").max(80, "Tên tối đa 80 ký tự"),
  role: z.enum(ROLE_LIST as [string, ...string[]]).optional(),
  password: userPasswordSchema.optional(),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
