import type { AxiosResponse } from 'axios';

import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  CONNECT_CALENDAR_PATH,
  CONVERSATIONS_PATH,
  connectPath,
  eventsPath,
  integrationPath,
  ME_INTEGRATIONS_PATH,
  meIntegrationPath,
  PROVIDERS_PATH,
  replayPath,
  resourcesPath,
  workspaceChannelsPath,
  workspaceIntegrationsPath,
} from './integrations.api';
import type {
  EventsPage,
  IntegrationEvent,
  IntegrationView,
  ProviderInfo,
  ResourcePage,
  TargetChannelOption,
  TargetGroupChatOption,
  UpdateIntegrationInput,
  UserIntegrationView,
  WebhookEventStatus,
  WorkspaceIntegrations,
} from './integrations.types';

export const EVENTS_PAGE_SIZE = 30;

/** ⛔ Danh sách cursor KHÔNG dùng `unwrapData` — nó bóc `.data` và vứt `meta` (cùng bẫy `inboxService.list`). */
function eventsPage(
  response: AxiosResponse<{ data?: IntegrationEvent[]; meta?: { nextCursor?: string | null } }>,
): EventsPage {
  return { items: response.data.data ?? [], nextCursor: response.data.meta?.nextCursor ?? null };
}

/**
 * Lớp gọi API tích hợp. Đọc thì `skipErrorToast` (màn tự vẽ lỗi trong khối); ghi để interceptor toast mã lỗi `INT_*` như mọi hành động khác.
 * Không lời gọi nào nhận/gửi token — BE giữ token mã hoá (INT-08).
 */
export const integrationsService = {
  async providers(): Promise<ProviderInfo[]> {
    return (
      unwrapData<ProviderInfo[]>(await apiClient.get(PROVIDERS_PATH, { skipErrorToast: true })) ??
      []
    );
  },

  async list(wsId: string): Promise<WorkspaceIntegrations> {
    const data = unwrapData<WorkspaceIntegrations>(
      await apiClient.get(workspaceIntegrationsPath(wsId), { skipErrorToast: true }),
    );
    return { canManage: data.canManage === true, items: data.items ?? [] };
  },

  async detail(id: string): Promise<IntegrationView> {
    return unwrapData<IntegrationView>(
      await apiClient.get(integrationPath(id), { skipErrorToast: true }),
    );
  },

  async connect(wsId: string, providerKey: string): Promise<{ authorizeUrl: string }> {
    return unwrapData<{ authorizeUrl: string }>(
      await apiClient.post(connectPath(wsId, providerKey), { returnTo: 'app' }),
    );
  },

  async update(id: string, input: UpdateIntegrationInput): Promise<IntegrationView> {
    return unwrapData<IntegrationView>(await apiClient.patch(integrationPath(id), input));
  },

  async disconnect(id: string): Promise<void> {
    await apiClient.delete(integrationPath(id));
  },

  async resources(id: string, query: string): Promise<ResourcePage> {
    const params = query ? { query } : undefined;
    const data = unwrapData<ResourcePage>(
      await apiClient.get(resourcesPath(id), { params, skipErrorToast: true }),
    );
    return { items: data.items ?? [], hasMore: data.hasMore === true };
  },

  async events(
    id: string,
    cursor: string | null,
    status?: WebhookEventStatus,
  ): Promise<EventsPage> {
    const params = {
      limit: EVENTS_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
      ...(status ? { status } : {}),
    };
    return eventsPage(await apiClient.get(eventsPath(id), { params, skipErrorToast: true }));
  },

  async replay(id: string, eventId: string): Promise<IntegrationEvent> {
    return unwrapData<IntegrationEvent>(await apiClient.post(replayPath(id, eventId)));
  },

  async channels(wsId: string): Promise<TargetChannelOption[]> {
    const data = unwrapData<{ joined?: TargetChannelOption[] }>(
      await apiClient.get(workspaceChannelsPath(wsId), {
        params: { include: 'joined', type: 'TEXT' },
        skipErrorToast: true,
      }),
    );
    return data.joined ?? [];
  },

  /**
   * Nhóm chat của tôi trong nhóm làm việc này (p5-03 P1: đích nhận tin ngoài kênh). Chỉ TRANG ĐẦU (tối đa 100 — trần `limit` của BE, sắp theo
   * hoạt động gần nhất) nên dùng `unwrapData` (bóc mảng `data`, bỏ `meta`) là đủ; không phân trang thêm vì người chọn còn có ô tìm trong tấm chọn.
   * Chỉ giữ nhóm còn ACTIVE và gửi được — nhóm giải tán/lưu trữ/`readOnly` thì BE từ chối `INT_005`, không đáng để người dùng chọn rồi mới bị báo lỗi.
   */
  async groupChats(wsId: string): Promise<TargetGroupChatOption[]> {
    const data = unwrapData<TargetGroupChatOption[]>(
      await apiClient.get(CONVERSATIONS_PATH, {
        params: { filter: 'group', limit: 100, workspaceId: wsId },
        skipErrorToast: true,
      }),
    );
    return (Array.isArray(data) ? data : []).filter((c) => c.status === 'ACTIVE' && !c.readOnly);
  },

  async mine(): Promise<UserIntegrationView[]> {
    return (
      unwrapData<UserIntegrationView[]>(
        await apiClient.get(ME_INTEGRATIONS_PATH, { skipErrorToast: true }),
      ) ?? []
    );
  },

  async connectCalendar(): Promise<{ authorizeUrl: string }> {
    return unwrapData<{ authorizeUrl: string }>(
      await apiClient.post(CONNECT_CALENDAR_PATH, { returnTo: 'app' }),
    );
  },

  async disconnectCalendar(id: string): Promise<void> {
    await apiClient.delete(meIntegrationPath(id));
  },
};
