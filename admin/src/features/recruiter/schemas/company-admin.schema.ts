import { z } from 'zod';

import { QUOTA_OVERRIDE_MAX } from '../constants/recruiter.constants';
import { companyNameField, reasonField, taxCodeField, websiteField } from './company-fields';

/**
 * Đổi gói / hạn mức (`recruiter:update`, `PATCH /admin/companies/:id`). `offerQuotaOverride` để TRỐNG (`null`) = theo gói;
 * số 0 là hợp lệ (chặn hẳn việc gửi lời mời) nên KHÔNG dùng "falsy" để suy ra trống.
 */
export const companyTierSchema = z.object({
  tier: z.enum(['FREE', 'PRO', 'ENTERPRISE']),
  offerQuotaOverride: z
    .number({ error: 'Nhập số nguyên từ 0' })
    .int('Hạn mức phải là số nguyên')
    .min(0, 'Hạn mức không âm')
    .max(QUOTA_OVERRIDE_MAX, `Hạn mức tối đa ${QUOTA_OVERRIDE_MAX.toLocaleString('vi-VN')}`)
    .nullable(),
  reason: reasonField,
});
export type CompanyTierFormValues = z.infer<typeof companyTierSchema>;

/** Sửa tên / MST / website (vận hành sửa được cả khi đã duyệt — HR thì bị khoá). MST trống = xoá MST. */
export const companyEditSchema = z.object({
  name: companyNameField,
  website: websiteField,
  taxCode: taxCodeField,
  reason: reasonField,
});
export type CompanyEditFormValues = z.infer<typeof companyEditSchema>;
