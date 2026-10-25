import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  PartnerAcceptingPayload,
  PartnerFileUrl,
  PartnerOrder,
  PartnerOrderStep,
  PartnerOrdersPage,
  PartnerPickupPayload,
  PartnerRejectPayload,
  PartnerShop,
} from '../types/partner.types';
import { partnerApi } from './partner.api';

/** 404 khi id sai/đơn của tiệm khác — trang chi tiết tự hiện "không tìm thấy", không toast. */
const QUIET = { skipErrorToast: true } as RequestConfig;

/**
 * Giao hàng bằng PIN KHÔNG toast từ interceptor: sai PIN (`O2O_007`) / khoá (`O2O_008`) / 429 là trạng thái BÌNH THƯỜNG của hộp
 * thoại giao hàng — nó tự hiện số lần còn lại / đếm ngược ngay trong hộp thoại thay vì một toast rồi mất.
 */
const INLINE_ERROR = { skipErrorToast: true } as RequestConfig;

const STEP_PATH: Record<PartnerOrderStep, (id: string) => string> = {
  accept: partnerApi.accept,
  printing: partnerApi.printing,
  ready: partnerApi.ready,
};

/** Service THUẦN cho cổng chủ tiệm — lỗi ghi để interceptor toast như mọi hành động khác (trừ giao hàng, xem `INLINE_ERROR`). */
export const partnerService = {
  myShops: async (): Promise<ApiResponse<PartnerShop[]>> =>
    (await apiClient.get<ApiResponse<PartnerShop[]>>(partnerApi.shops)).data,

  setAccepting: async ({
    id,
    acceptingOrders,
  }: PartnerAcceptingPayload): Promise<ApiResponse<{ id: string; acceptingOrders: boolean }>> =>
    (
      await apiClient.post<ApiResponse<{ id: string; acceptingOrders: boolean }>>(
        partnerApi.accepting(id),
        { acceptingOrders },
      )
    ).data,

  /** `status` = danh sách trạng thái ngăn dấu phẩy; `cursor` từ `meta.nextCursor` của trang trước. */
  listOrders: async (params: {
    status: string;
    cursor?: string;
    limit: number;
  }): Promise<PartnerOrdersPage> =>
    (await apiClient.get<PartnerOrdersPage>(partnerApi.orders, { params })).data,

  getOrder: async (id: string): Promise<ApiResponse<PartnerOrder>> =>
    (await apiClient.get<ApiResponse<PartnerOrder>>(partnerApi.order(id), QUIET)).data,

  /** Nhận đơn / bắt đầu in / đã in xong — cùng một dạng gọi, khác đường dẫn. */
  step: async ({
    id,
    step,
  }: {
    id: string;
    step: PartnerOrderStep;
  }): Promise<ApiResponse<PartnerOrder>> =>
    (await apiClient.post<ApiResponse<PartnerOrder>>(STEP_PATH[step](id))).data,

  reject: async ({ id, reason }: PartnerRejectPayload): Promise<ApiResponse<PartnerOrder>> =>
    (await apiClient.post<ApiResponse<PartnerOrder>>(partnerApi.reject(id), { reason })).data,

  file: async (id: string): Promise<ApiResponse<PartnerFileUrl>> =>
    (await apiClient.get<ApiResponse<PartnerFileUrl>>(partnerApi.file(id))).data,

  pickup: async ({ id, pin, markPaid }: PartnerPickupPayload): Promise<ApiResponse<PartnerOrder>> =>
    (
      await apiClient.post<ApiResponse<PartnerOrder>>(
        partnerApi.pickup(id),
        { pin, markPaid },
        INLINE_ERROR,
      )
    ).data,

  markPaid: async (id: string): Promise<ApiResponse<PartnerOrder>> =>
    (await apiClient.post<ApiResponse<PartnerOrder>>(partnerApi.markPaid(id))).data,
};
