import { z } from 'zod';

import {
  REVIEW_REMINDER_HOURS_MAX,
  REVIEW_REMINDER_HOURS_MIN,
  REVIEW_REMINDERS_MAX,
  REVIEW_REQUIRED_MAX,
  REVIEW_REQUIRED_MIN,
} from '../constants/pm.constants';

const hours = z
  .number({ error: 'Nhập một số' })
  .int('Nhập số nguyên')
  .min(REVIEW_REMINDER_HOURS_MIN, `Tối thiểu ${REVIEW_REMINDER_HOURS_MIN} giờ`)
  .max(REVIEW_REMINDER_HOURS_MAX, `Tối đa ${REVIEW_REMINDER_HOURS_MAX} giờ`);

/**
 * Schema form "Chấm chéo — mặc định cho bảng mới" — GIỐNG schema `pm.review` phía BE
 * (`be/src/core/config/system-config.registry.ts`): số lượt duyệt nguyên 1–`requiredMax`, 1–3 mốc nhắc là số giờ nguyên
 * 1–168 và TĂNG DẦN. `reminders` là mảng đối tượng `{ hours }` vì `useFieldArray` không nhận mảng số trần; `reviewPatch`
 * dẹt lại thành `reminderHours: number[]` khi gửi.
 *
 * Lỗi "tăng dần" / số mốc gắn ở mảng `reminders` (không thuộc ô nào) — `ReviewDefaultsFields` hiện ngay dưới danh sách.
 * `requiredMax` = trần hiện hành của khoá (`fields[].ceil` do BE trả), nên form không cho nhập vượt trần BE sẽ từ chối.
 */
export function buildReviewDefaultsSchema(requiredMax: number = REVIEW_REQUIRED_MAX) {
  return z.object({
    enabledForNewBoards: z.boolean(),
    requiredReviews: z
      .number({ error: 'Nhập một số' })
      .int('Nhập số nguyên')
      .min(REVIEW_REQUIRED_MIN, `Tối thiểu ${REVIEW_REQUIRED_MIN} lượt`)
      .max(requiredMax, `Tối đa ${requiredMax} lượt`),
    reminders: z
      .array(z.object({ hours }))
      .min(1, 'Cần ít nhất một mốc nhắc')
      .max(REVIEW_REMINDERS_MAX, `Tối đa ${REVIEW_REMINDERS_MAX} mốc nhắc`)
      .refine(
        (rows) => rows.every((row, i) => i === 0 || row.hours > rows[i - 1].hours),
        'Các mốc nhắc phải tăng dần',
      ),
  });
}

export type ReviewDefaultsFormValues = z.infer<ReturnType<typeof buildReviewDefaultsSchema>>;
