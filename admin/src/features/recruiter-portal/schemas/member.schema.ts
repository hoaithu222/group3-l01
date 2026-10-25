import { z } from 'zod';

import { emailField } from '@/shared/utils/validation/validators.utils';

/** Khớp `addMemberSchema` của BE: email hợp lệ ≤ 254, vai trò OWNER | RECRUITER. Người phải ĐÃ có tài khoản (BE `USER_001` khi chưa có). */
export const addMemberFormSchema = z.object({
  email: emailField(),
  role: z.enum(['RECRUITER', 'OWNER']),
});
export type AddMemberFormValues = z.infer<typeof addMemberFormSchema>;
