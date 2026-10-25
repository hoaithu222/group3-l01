import { z } from 'zod';

import { requiredText } from '@/shared/utils/validation/validators.utils';

import { PUSH_TEST_TYPES } from '../types/notifications-config.types';

/**
 * Form "Gửi push thử" — khớp `adminPushTestSchema` phía BE (`reason` ≥ 10 ký tự,
 * ghi vào audit). `userId` rỗng = gửi cho chính người thao tác (điền lúc gửi, xem
 * `PushTestForm`); ID chọn từ danh sách nên không trim/regex — BE kiểm ObjectId.
 * KHÔNG có trường nội dung: nội dung push thử do BE cố định.
 */
export const pushTestSchema = z.object({
  userId: z.string(),
  type: z.enum(PUSH_TEST_TYPES),
  reason: requiredText('Lý do là bắt buộc')
    .min(10, 'Lý do tối thiểu 10 ký tự')
    .max(500, 'Lý do tối đa 500 ký tự'),
});

export type PushTestFormValues = z.infer<typeof pushTestSchema>;
