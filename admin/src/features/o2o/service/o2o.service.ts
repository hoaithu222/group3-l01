import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  AdminLocation,
  AdminLocationDetail,
  AdminLocationsParams,
  AdminOrder,
  AdminOrdersParams,
  AdminShop,
  AdminShopDetail,
  AdminShopSuspendResult,
  AdminShopsParams,
  CreateShopPayload,
  LocationBody,
  ReasonPayload,
  ReviewHiddenResult,
  ReviewsPage,
  UpdateLocationPayload,
  UpdateShopPayload,
} from '../types/o2o.types';
import { o2oApi } from './o2o.api';

/** 404 khi id sai/đã bị ẩn khỏi tầm nhìn (deep link) — ngăn kéo tự hiện "không tìm thấy", không toast. */
const QUIET = { skipErrorToast: true } as RequestConfig;

interface HiddenArgs extends ReasonPayload {
  hidden: boolean;
}

/** Service THUẦN cho admin O2O — lỗi ghi để interceptor toast như mọi hành động khác. */
export const o2oService = {
  // ── Địa điểm ──────────────────────────────────────────────────────────────
  listLocations: async (params: AdminLocationsParams): Promise<ApiResponse<AdminLocation[]>> =>
    (await apiClient.get<ApiResponse<AdminLocation[]>>(o2oApi.locations, { params })).data,

  getLocation: async (id: string): Promise<ApiResponse<AdminLocationDetail>> =>
    (await apiClient.get<ApiResponse<AdminLocationDetail>>(o2oApi.location(id), QUIET)).data,

  createLocation: async (body: LocationBody): Promise<ApiResponse<AdminLocation>> =>
    (await apiClient.post<ApiResponse<AdminLocation>>(o2oApi.locations, body)).data,

  updateLocation: async ({
    id,
    ...body
  }: UpdateLocationPayload): Promise<ApiResponse<AdminLocation>> =>
    (await apiClient.patch<ApiResponse<AdminLocation>>(o2oApi.location(id), body)).data,

  setLocationHidden: async ({
    id,
    reason,
    hidden,
  }: HiddenArgs): Promise<ApiResponse<AdminLocation>> =>
    (
      await apiClient.post<ApiResponse<AdminLocation>>(
        hidden ? o2oApi.locationHide(id) : o2oApi.locationUnhide(id),
        { reason },
      )
    ).data,

  listReviews: async (id: string, cursor?: string): Promise<ReviewsPage> =>
    (
      await apiClient.get<ReviewsPage>(o2oApi.locationReviews(id), {
        params: { cursor, limit: 20 },
      })
    ).data,

  setReviewHidden: async ({
    id,
    reason,
    hidden,
  }: HiddenArgs): Promise<ApiResponse<ReviewHiddenResult>> =>
    (
      await apiClient.post<ApiResponse<ReviewHiddenResult>>(
        hidden ? o2oApi.reviewHide(id) : o2oApi.reviewUnhide(id),
        { reason },
      )
    ).data,

  // ── Tiệm in ───────────────────────────────────────────────────────────────
  listShops: async (params: AdminShopsParams): Promise<ApiResponse<AdminShop[]>> =>
    (await apiClient.get<ApiResponse<AdminShop[]>>(o2oApi.shops, { params })).data,

  getShop: async (id: string): Promise<ApiResponse<AdminShopDetail>> =>
    (await apiClient.get<ApiResponse<AdminShopDetail>>(o2oApi.shop(id), QUIET)).data,

  createShop: async (body: CreateShopPayload): Promise<ApiResponse<AdminShop>> =>
    (await apiClient.post<ApiResponse<AdminShop>>(o2oApi.shops, body)).data,

  updateShop: async ({ id, ...body }: UpdateShopPayload): Promise<ApiResponse<AdminShop>> =>
    (await apiClient.patch<ApiResponse<AdminShop>>(o2oApi.shop(id), body)).data,

  approveShop: async ({ id, reason }: ReasonPayload): Promise<ApiResponse<AdminShop>> =>
    (await apiClient.post<ApiResponse<AdminShop>>(o2oApi.shopApprove(id), { reason })).data,

  suspendShop: async ({
    id,
    reason,
  }: ReasonPayload): Promise<ApiResponse<AdminShopSuspendResult>> =>
    (
      await apiClient.post<ApiResponse<AdminShopSuspendResult>>(o2oApi.shopSuspend(id), {
        reason,
      })
    ).data,

  // ── Đơn in ────────────────────────────────────────────────────────────────
  listOrders: async (params: AdminOrdersParams): Promise<ApiResponse<AdminOrder[]>> =>
    (await apiClient.get<ApiResponse<AdminOrder[]>>(o2oApi.orders, { params })).data,

  getOrder: async (id: string): Promise<ApiResponse<AdminOrder>> =>
    (await apiClient.get<ApiResponse<AdminOrder>>(o2oApi.order(id), QUIET)).data,

  cancelOrder: async ({ id, reason }: ReasonPayload): Promise<ApiResponse<AdminOrder>> =>
    (await apiClient.post<ApiResponse<AdminOrder>>(o2oApi.orderCancel(id), { reason })).data,
};
