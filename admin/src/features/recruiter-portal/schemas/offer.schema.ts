import { z } from 'zod';

import { requiredText } from '@/shared/utils/validation/validators.utils';

import { OFFER_LIMITS } from '../constants/portal.constants';

const ASSET_ID_RE = /^[a-f0-9]{24}$/i;

/** JD = giá trị của `FileField` — `url` LÀ id asset (xem `company.schema.ts`); `null` = không đính kèm. */
const jdField = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    url: z.string().regex(ASSET_ID_RE, 'Tệp JD chưa tải xong, hãy đợi hoặc chọn lại'),
    size: z.number().optional(),
  })
  .nullable();

/**
 * Khớp `sendOfferSchema` của BE (`be/src/modules/recruiter/dtos/offer.dto.ts`, `LIMITS.offer`): tiêu đề 3–120, nội dung 20–2000, loại việc 4 giá trị,
 * khu vực ≤ 60 (tuỳ chọn), JD PDF tuỳ chọn. `studentId` KHÔNG nằm trong form — lấy từ ứng viên đang xem.
 */
export const sendOfferFormSchema = z.object({
  title: requiredText('Tiêu đề là bắt buộc')
    .min(OFFER_LIMITS.titleMin, `Tiêu đề tối thiểu ${OFFER_LIMITS.titleMin} ký tự`)
    .max(OFFER_LIMITS.titleMax, `Tiêu đề tối đa ${OFFER_LIMITS.titleMax} ký tự`),
  employmentType: z.enum(['INTERNSHIP', 'FULL_TIME', 'PART_TIME', 'FREELANCE']),
  location: z.string().trim().max(OFFER_LIMITS.locationMax, `Khu vực tối đa ${OFFER_LIMITS.locationMax} ký tự`),
  message: requiredText('Nội dung là bắt buộc')
    .min(OFFER_LIMITS.messageMin, `Nội dung tối thiểu ${OFFER_LIMITS.messageMin} ký tự`)
    .max(OFFER_LIMITS.messageMax, `Nội dung tối đa ${OFFER_LIMITS.messageMax} ký tự`),
  jd: jdField,
});
export type SendOfferFormValues = z.infer<typeof sendOfferFormSchema>;

/** Tin trao đổi 1–2000 ký tự sau khi cắt trắng (`offerMessageSchema`). */
export const offerMessageFormSchema = z.object({
  content: requiredText('Nhập nội dung tin nhắn').max(
    OFFER_LIMITS.threadMessageMax,
    `Tối đa ${OFFER_LIMITS.threadMessageMax} ký tự`,
  ),
});
export type OfferMessageFormValues = z.infer<typeof offerMessageFormSchema>;
