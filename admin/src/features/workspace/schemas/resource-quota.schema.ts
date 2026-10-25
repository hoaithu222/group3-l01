import { z } from 'zod';

import { QUOTA_GIB_MAX, QUOTA_GIB_MIN } from '../constants/workspace-resources.constants';
import { formatGib } from '../utils/workspace-resources.utils';

/**
 * Form "Đặt hạn mức kho tài liệu riêng" (p3-01 admin.md §2.1): hạn mức GiB trong khoảng BE cho phép + lý do.
 * Số trong thông báo lỗi đi qua `formatGib` (dấu phẩy thập phân vi-VN), không phải `toLocaleString`.
 */
export const resourceQuotaSchema = z.object({
  gib: z
    .number({ error: 'Nhập hạn mức (GiB)' })
    .min(QUOTA_GIB_MIN, `Tối thiểu ${formatGib(QUOTA_GIB_MIN)} GiB`)
    .max(QUOTA_GIB_MAX, `Tối đa ${formatGib(QUOTA_GIB_MAX)} GiB`),
  // Cùng ngưỡng với `ConfirmWithReasonModal` (khớp `reasonSchema` phía BE).
  reason: z.string().trim().min(10, 'Lý do tối thiểu 10 ký tự').max(500, 'Lý do tối đa 500 ký tự'),
});

export type ResourceQuotaFormValues = z.infer<typeof resourceQuotaSchema>;
