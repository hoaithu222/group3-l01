import { z } from 'zod';

import {
  emailField,
  passwordField,
  requiredText,
} from '@/shared/utils/validation/validators.utils';

/** Khớp `RoleCode` phía BE (`docs/plan/config-be.md §3.1`). */
export const USER_ROLES = ['admin', 'manager', 'user'] as const;

/**
 * Lý do bắt buộc cho mọi thao tác quản trị có ảnh hưởng người khác (khoá, mở,
 * đổi vai trò) — khớp `reasonSchema` phía BE (tối thiểu 10 ký tự, ghi vào audit
 * log). `.trim()` trước `.min(10)` — xem `docs/rules/form-validation.md`.
 */
export const reasonSchema = z.object({
  reason: requiredText('Lý do là bắt buộc')
    .min(10, 'Lý do tối thiểu 10 ký tự')
    .max(500, 'Lý do tối đa 500 ký tự'),
});
export type ReasonFormValues = z.infer<typeof reasonSchema>;

export const changeRoleSchema = z.object({
  role: z.enum(USER_ROLES),
  reason: requiredText('Lý do là bắt buộc')
    .min(10, 'Lý do tối thiểu 10 ký tự')
    .max(500, 'Lý do tối đa 500 ký tự'),
});
export type ChangeRoleFormValues = z.infer<typeof changeRoleSchema>;

/**
 * Khớp `createUserSchema` phía BE (`be/src/modules/users/dtos/create-user.dto.ts`): tên 1–80 ký
 * tự, email ≤ 254, mật khẩu 8–128 (chính sách chung, KHÔNG bắt buộc chữ hoa/số — form chặt hơn
 * BE thì quản trị viên bị từ chối oan những mật khẩu BE nhận).
 */
export const createUserSchema = z.object({
  email: emailField(),
  name: requiredText('Họ tên là bắt buộc').max(80, 'Tên tối đa 80 ký tự'),
  password: passwordField(),
  role: z.enum(USER_ROLES),
});
export type CreateUserFormValues = z.infer<typeof createUserSchema>;

/** Khớp `AnonymizeDto` phía BE (`mode: 'GRACE'|'NOW'`). */
export const ANONYMIZE_MODES = ['GRACE', 'NOW'] as const;

/**
 * Ẩn danh hoá tài khoản — `reason` khớp `reasonSchema` chung (≥ 10 ký tự,
 * dùng cho cả khoá/mở/đổi vai trò). `confirmEmail` chỉ bắt buộc VÀ phải khớp
 * CHÍNH XÁC (phân biệt hoa/thường, không trim ở phía BE — `input.confirmEmail
 * !== user.email`) khi `mode: 'NOW'` — `targetEmail` truyền vào lúc dựng form
 * vì nó phụ thuộc người dùng đang xem, không phải hằng số tĩnh như
 * `changeRoleSchema`.
 */
export function createAnonymizeUserSchema(targetEmail: string) {
  return z
    .object({
      mode: z.enum(ANONYMIZE_MODES),
      reason: requiredText('Lý do là bắt buộc')
        .min(10, 'Lý do tối thiểu 10 ký tự')
        .max(500, 'Lý do tối đa 500 ký tự'),
      confirmEmail: z.string().trim().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.mode === 'NOW' && data.confirmEmail !== targetEmail) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['confirmEmail'],
          message: `Gõ đúng "${targetEmail}" để xác nhận`,
        });
      }
    });
}
export type AnonymizeUserFormValues = z.infer<ReturnType<typeof createAnonymizeUserSchema>>;
