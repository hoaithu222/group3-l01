import type { SendOfferFormValues } from '../schemas/offer.schema';
import type { SendOfferPayload } from '../types/offer.types';

/**
 * Form → payload gửi lời mời. `location`/`jdAssetId` để TRỐNG thì KHÔNG gửi (`sendOfferSchema` `.strict()`: chuỗi rỗng ở `location` hợp lệ nhưng vô nghĩa, `jdAssetId` rỗng thì
 * bị từ chối). `studentId` và `idempotencyKey` do nơi gọi cấp — không nằm trong form.
 */
export function toSendOfferPayload(
  v: SendOfferFormValues,
  ctx: { companyId: string; studentId: string; idempotencyKey: string },
): SendOfferPayload {
  return {
    companyId: ctx.companyId,
    studentId: ctx.studentId,
    idempotencyKey: ctx.idempotencyKey,
    title: v.title,
    message: v.message,
    employmentType: v.employmentType,
    ...(v.location && { location: v.location }),
    ...(v.jd && { jdAssetId: v.jd.url }),
  };
}
