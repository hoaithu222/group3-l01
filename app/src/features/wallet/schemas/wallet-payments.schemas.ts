import { z } from 'zod';

import { isoDate, money, nullable } from './schema-helpers';
import { settlementMethodSchema, settlementStatusSchema } from './wallet.schemas';

/**
 * Schema phản hồi của NHÓM THANH TOÁN: settlement · hồ sơ nhận tiền · thông tin người nhận · kết quả nhắc nợ.
 * Cùng quy ước với `wallet.schemas.ts` (tiền là số nguyên, vắng mặt = `null`).
 */

export const settlementViewSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  /** Mã 8 ký tự — nội dung chuyển khoản là `SA <code>`. */
  code: z.string(),
  fromId: z.string(),
  toId: z.string(),
  amount: money,
  method: settlementMethodSchema,
  proofAssetId: nullable(z.string()),
  note: nullable(z.string()),
  status: settlementStatusSchema,
  allocations: z.array(z.object({ shareId: z.string(), amount: money })),
  confirmedAt: nullable(isoDate),
  rejectedAt: nullable(isoDate),
  rejectReason: nullable(z.string()),
  cancelledAt: nullable(isoDate),
  version: money,
  createdAt: isoDate,
});

export const paymentProfileViewSchema = z.object({
  id: z.string(),
  bankBin: z.string(),
  bankName: nullable(z.string()),
  accountLast4: z.string(),
  accountName: z.string(),
  isDefault: z.boolean(),
  createdAt: isoDate,
});

export const paymentInfoViewSchema = z.object({
  bankBin: z.string(),
  bankName: nullable(z.string()),
  /** ⛔ Số tài khoản ĐẦY ĐỦ — không log, không persist (`gcTime: 0`), không cache lâu. */
  accountNumber: z.string(),
  accountName: z.string(),
  suggestedAmount: money,
  /** 8 ký tự — nội dung CK `SA <reference>` và gửi lại khi tạo settlement để BE khớp. */
  reference: z.string(),
});

export const remindResultSchema = z.object({ remindedCount: money });

export const settlementListSchema = z.array(settlementViewSchema);
export const paymentProfileListSchema = z.array(paymentProfileViewSchema);
