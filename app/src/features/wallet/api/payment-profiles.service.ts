import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { PAYMENT_PROFILES_PATH, paymentProfileDefaultPath, paymentProfilePath } from './wallet.api';
import { parseView } from './parse-view';
import type { CreatePaymentProfilePayload, PaymentProfileView } from './wallet.types';
import {
  paymentProfileListSchema,
  paymentProfileViewSchema,
} from '../schemas/wallet-payments.schemas';

const what = 'tài khoản nhận tiền';

/**
 * Tài khoản nhận tiền của CHÍNH MÌNH (`/me/payment-profiles`). BE không bao giờ
 * trả số tài khoản đầy đủ ở đây — chỉ `accountLast4`. Số đầy đủ chỉ tới người
 * ĐANG NỢ mình qua `settlementsService.paymentInfo`.
 */
export const paymentProfilesService = {
  async list(): Promise<PaymentProfileView[]> {
    const response = await apiClient.get(PAYMENT_PROFILES_PATH);
    return parseView(paymentProfileListSchema, unwrapData(response), 'danh sách tài khoản');
  },

  /** `WALLET_009` = quá 3 tài khoản. Lỗi hiện trong form nên tắt toast mặc định. */
  async create(payload: CreatePaymentProfilePayload): Promise<PaymentProfileView> {
    const response = await apiClient.post(PAYMENT_PROFILES_PATH, payload, { skipErrorToast: true });
    return parseView(paymentProfileViewSchema, unwrapData(response), what);
  },

  async setDefault(profileId: string): Promise<PaymentProfileView> {
    const response = await apiClient.post(paymentProfileDefaultPath(profileId));
    return parseView(paymentProfileViewSchema, unwrapData(response), what);
  },

  /** HTTP 200 `data: null` — không đọc body. */
  async remove(profileId: string): Promise<void> {
    await apiClient.delete(paymentProfilePath(profileId));
  },
};
