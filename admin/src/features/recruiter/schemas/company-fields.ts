import { z } from 'zod';

import { requiredText } from '@/shared/utils/validation/validators.utils';

import { COMPANY_LIMITS, REASON_LIMITS } from '../constants/recruiter.constants';

/**
 * Mảnh schema DÙNG CHUNG cho mọi form doanh nghiệp (đăng ký, hồ sơ HR, sửa của vận hành) — khớp `registerCompanySchema`/`adminCompanyPatchSchema` của BE
 * (`be/src/modules/recruiter/dtos/company.dto.ts`): tên 2–120, website http(s) ≤ 200, MST 10 số hoặc `10 số-3 số` (chi nhánh), mô tả ≤ 2000.
 * Zod ở admin là v4, ở BE là v3 — đối chiếu bằng tay, không chép schema chéo.
 */
const isHttpUrl = (value: string): boolean => {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    return new URL(value).hostname.length > 0;
  } catch {
    return false;
  }
};

export const companyNameField = requiredText('Tên doanh nghiệp là bắt buộc')
  .min(COMPANY_LIMITS.nameMin, `Tên tối thiểu ${COMPANY_LIMITS.nameMin} ký tự`)
  .max(COMPANY_LIMITS.nameMax, `Tên tối đa ${COMPANY_LIMITS.nameMax} ký tự`);

export const websiteField = requiredText('Website là bắt buộc')
  .max(COMPANY_LIMITS.websiteMax, `Website tối đa ${COMPANY_LIMITS.websiteMax} ký tự`)
  .refine(isHttpUrl, 'Website phải là địa chỉ bắt đầu bằng http:// hoặc https://');

/** MST tuỳ chọn: rỗng được; có giá trị thì phải đúng dạng. */
export const taxCodeField = z
  .string()
  .trim()
  .regex(/^(\d{10}(-\d{3})?)?$/, 'Mã số thuế gồm 10 số (hoặc 10 số-3 số chi nhánh)');

export const descriptionField = z
  .string()
  .trim()
  .max(COMPANY_LIMITS.descriptionMax, `Mô tả tối đa ${COMPANY_LIMITS.descriptionMax} ký tự`);

export const industryField = z
  .string()
  .trim()
  .max(COMPANY_LIMITS.industryMax, `Ngành tối đa ${COMPANY_LIMITS.industryMax} ký tự`);

/** Lý do 10–500 — khớp `reasonSchema` của BE; `.trim()` trước `.min()` (form-validation.md). */
export const reasonField = requiredText('Lý do là bắt buộc')
  .min(REASON_LIMITS.min, `Lý do tối thiểu ${REASON_LIMITS.min} ký tự`)
  .max(REASON_LIMITS.max, `Lý do tối đa ${REASON_LIMITS.max} ký tự`);
