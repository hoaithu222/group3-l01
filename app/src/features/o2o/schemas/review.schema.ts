import { z } from 'zod';

import { O2O_LIMITS } from '../constants/o2o.constants';

/**
 * Form đánh giá địa điểm — khớp `reviewSchema` của BE (`rating` 1–5, `noise` 1–5, `comment` ≤ 500).
 * `.trim()` trên chuỗi: bàn phím di động tự chèn dấu cách sau gợi ý tự hoàn thành (`form-and-test`). `rating`/`noise` mặc định `0` = "chưa chọn"
 * để lỗi hiện đúng ô khi bấm Gửi mà chưa chọn — chọn lại là lỗi biến mất (`reValidateMode: 'onChange'`).
 */
export const reviewFormSchema = z.object({
  rating: z.number().int().min(1, 'Hãy chọn số sao').max(5),
  noise: z.number().int().min(1, 'Hãy chọn độ ồn').max(5),
  comment: z
    .string()
    .trim()
    .max(O2O_LIMITS.reviewCommentMax, `Tối đa ${O2O_LIMITS.reviewCommentMax} ký tự`),
});

export type ReviewFormValues = z.infer<typeof reviewFormSchema>;
