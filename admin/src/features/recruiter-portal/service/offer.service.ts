import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import { MESSAGES_PAGE_SIZE } from '../constants/portal.constants';
import type {
  OfferDetail,
  OfferItem,
  OfferListParams,
  OfferMessage,
  SendMessagePayload,
  SendOfferPayload,
} from '../types/offer.types';
import type { CursorPage } from '../types/portal.types';
import { portalApi } from './portal.api';

const quiet = { skipErrorToast: true } as RequestConfig;

/**
 * Service THUẦN lời mời + trao đổi. `send` để CALLER xử lý lỗi (không toast): `RECR_005` hiện hạn mức + đề xuất nâng gói, `RECR_006`/`RECR_007` đóng modal với thông điệp
 * riêng, nên toast chung của interceptor sẽ chồng lên. `Idempotency-Key` do caller giữ ổn định giữa các lần thử lại (xem `useIdempotencyKey`).
 * `withdraw`/`sendMessage` để interceptor toast lỗi như mọi hành động ghi khác.
 */
export const offerService = {
  list: async (
    companyId: string,
    params: OfferListParams,
    cursor?: string,
  ): Promise<CursorPage<OfferItem>> => {
    const res = (
      await apiClient.get<CursorPage<OfferItem>>(portalApi.offers(companyId), {
        params: { ...params, cursor },
      })
    ).data;
    return { data: res.data, meta: res.meta };
  },

  detail: async (companyId: string, offerId: string): Promise<OfferDetail> =>
    (
      await apiClient.get<ApiResponse<OfferDetail>>(portalApi.offer(companyId, offerId), quiet)
    ).data.data,

  send: async ({
    companyId,
    idempotencyKey,
    ...body
  }: SendOfferPayload): Promise<ApiResponse<OfferDetail>> =>
    (
      await apiClient.post<ApiResponse<OfferDetail>>(portalApi.offers(companyId), body, {
        headers: { 'Idempotency-Key': idempotencyKey },
        ...quiet,
      })
    ).data,

  withdraw: async (companyId: string, offerId: string): Promise<ApiResponse<OfferDetail>> =>
    (await apiClient.post<ApiResponse<OfferDetail>>(portalApi.withdraw(companyId, offerId))).data,

  /** Mới nhất TRƯỚC (BE); trang kế theo `cursor` là các tin CŨ HƠN. */
  messages: async (offerId: string, cursor?: string): Promise<CursorPage<OfferMessage>> => {
    const res = (
      await apiClient.get<CursorPage<OfferMessage>>(portalApi.messages(offerId), {
        params: { cursor, limit: MESSAGES_PAGE_SIZE },
        ...quiet,
      })
    ).data;
    return { data: res.data, meta: res.meta };
  },

  sendMessage: async ({
    offerId,
    ...body
  }: SendMessagePayload): Promise<ApiResponse<OfferMessage>> =>
    (await apiClient.post<ApiResponse<OfferMessage>>(portalApi.messages(offerId), body)).data,
};
