import { z } from 'zod';

import { REPORT_LIMITS, RESOLVE_REASON_LIMITS } from '../constants/moderation.constants';

/**
 * Luật form báo cáo — khớp `createReportSchema` của BE (`be/src/modules/moderation/dtos`):
 * `description` ≤ 1.000, và `reason = OTHER` thì bắt buộc ≥ 10 ký tự. Kiểm ở app để nút Gửi khoá
 * SỚM chứ không đợi 400 `VAL_001`; BE vẫn là nguồn kiểm cuối.
 *
 * ⚠️ `.trim()` TRƯỚC `.min/.max`: bàn phím di động tự chèn dấu cách sau gợi ý, và 10 dấu cách
 * không phải là "mô tả".
 */
export const reportFormSchema = z
  .object({
    reason: z.enum(['SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'SCAM', 'IMPERSONATION', 'OTHER']),
    description: z.string().trim().max(REPORT_LIMITS.descriptionMax, `Mô tả tối đa ${REPORT_LIMITS.descriptionMax} ký tự`),
  })
  .refine((value) => value.reason !== 'OTHER' || value.description.length >= REPORT_LIMITS.otherDescriptionMin, {
    message: `Mô tả ít nhất ${REPORT_LIMITS.otherDescriptionMin} ký tự khi chọn "Khác"`,
    path: ['description'],
  });

export type ReportFormValues = z.infer<typeof reportFormSchema>;

/** Lý do xử lý — khớp `reasonSchema` của BE (`shared/dto/common-schemas.ts`): 10–500 sau khi cắt khoảng trắng. */
export const resolveReasonSchema = z
  .string()
  .trim()
  .min(RESOLVE_REASON_LIMITS.min, `Lý do tối thiểu ${RESOLVE_REASON_LIMITS.min} ký tự`)
  .max(RESOLVE_REASON_LIMITS.max, `Lý do tối đa ${RESOLVE_REASON_LIMITS.max} ký tự`);
