import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  AdminConnection,
  AdminConnectionsParams,
  AdminEventsParams,
  AdminProviderRow,
  AdminWebhookEvent,
  AdminWebhookEventDetail,
  AdminWorkspaceConnection,
  ToggleProviderPayload,
} from '../types/integration.types';
import { integrationApi } from './integration.api';

/** Service THUẦN cho admin tích hợp — lỗi ghi để interceptor toast như mọi hành động khác. */
export const integrationService = {
  listEvents: async (params: AdminEventsParams): Promise<ApiResponse<AdminWebhookEvent[]>> =>
    (await apiClient.get<ApiResponse<AdminWebhookEvent[]>>(integrationApi.events, { params })).data,

  /** 404 khi id sai/đã bị dọn (deep link) — ngăn kéo tự hiện "không tìm thấy", không toast. */
  getEvent: async (id: string): Promise<ApiResponse<AdminWebhookEventDetail>> =>
    (
      await apiClient.get<ApiResponse<AdminWebhookEventDetail>>(integrationApi.event(id), {
        skipErrorToast: true,
      } as RequestConfig)
    ).data,

  replayEvent: async ({
    id,
    reason,
  }: {
    id: string;
    reason: string;
  }): Promise<ApiResponse<AdminWebhookEvent>> =>
    (
      await apiClient.post<ApiResponse<AdminWebhookEvent>>(integrationApi.eventReplay(id), {
        reason,
      })
    ).data,

  listProviders: async (): Promise<ApiResponse<AdminProviderRow[]>> =>
    (await apiClient.get<ApiResponse<AdminProviderRow[]>>(integrationApi.providers)).data,

  toggleProvider: async ({
    provider,
    ...body
  }: ToggleProviderPayload): Promise<ApiResponse<AdminProviderRow>> =>
    (await apiClient.put<ApiResponse<AdminProviderRow>>(integrationApi.provider(provider), body))
      .data,

  listConnections: async (
    params: AdminConnectionsParams,
  ): Promise<ApiResponse<AdminConnection[]>> =>
    (await apiClient.get<ApiResponse<AdminConnection[]>>(integrationApi.connections, { params }))
      .data,

  /** Tab "Tích hợp" của workspace tự vẽ trạng thái lỗi/cờ tắt (404 `CFG_005`) — bỏ toast của interceptor để không báo hai lần. */
  listForWorkspace: async (workspaceId: string): Promise<ApiResponse<AdminWorkspaceConnection[]>> =>
    (
      await apiClient.get<ApiResponse<AdminWorkspaceConnection[]>>(
        integrationApi.workspaceConnections(workspaceId),
        { skipErrorToast: true } as RequestConfig,
      )
    ).data,
};
