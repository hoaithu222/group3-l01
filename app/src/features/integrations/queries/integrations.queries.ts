import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import { integrationsService } from '../api/integrations.service';
import type {
  EventsPage,
  IntegrationView,
  UpdateIntegrationInput,
  WebhookEventStatus,
} from '../api/integrations.types';

/** Khoá React Query (app.md §4). Đăng xuất đã `queryClient.clear()` nên không cần dọn riêng. */
export const integrationKeys = {
  all: ['integrations'] as const,
  providers: () => ['integrations', 'providers'] as const,
  list: (wsId: string) => ['integrations', 'list', wsId] as const,
  detail: (id: string) => ['integrations', 'detail', id] as const,
  events: (id: string, status?: WebhookEventStatus) =>
    ['integrations', 'events', id, status ?? 'all'] as const,
  eventsAll: (id: string) => ['integrations', 'events', id] as const,
  resources: (id: string, query: string) => ['integrations', 'resources', id, query] as const,
  channels: (wsId: string) => ['integrations', 'channels', wsId] as const,
  // ⚠️ 'conversations' chứ không 'group-chats': chuỗi có dạng `group-*` bị `check:classes` coi là class Tailwind chết.
  conversations: (wsId: string) => ['integrations', 'conversations', wsId] as const,
  me: () => ['integrations', 'me'] as const,
};

/** Nhà cung cấp — staleTime 5 phút (bật/tắt ở admin hiếm khi đổi). */
export function useIntegrationProviders() {
  return useQuery({
    queryFn: integrationsService.providers,
    queryKey: integrationKeys.providers(),
    staleTime: 5 * 60_000,
  });
}

/** Kết nối của nhóm — staleTime 30 s; socket `integration:updated` làm mới sớm hơn. */
export function useWorkspaceIntegrations(wsId: string) {
  return useQuery({
    enabled: Boolean(wsId),
    queryFn: () => integrationsService.list(wsId),
    queryKey: integrationKeys.list(wsId),
    staleTime: 30_000,
  });
}

export function useIntegrationDetail(id: string) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => integrationsService.detail(id),
    queryKey: integrationKeys.detail(id),
  });
}

/** Repo/project để chọn theo dõi — chỉ tải khi tấm chọn đang mở. */
export function useIntegrationResources(id: string, query: string, enabled: boolean) {
  return useQuery({
    enabled: enabled && Boolean(id),
    queryFn: () => integrationsService.resources(id, query),
    queryKey: integrationKeys.resources(id, query),
    staleTime: 60_000,
  });
}

export function useTargetChannels(wsId: string, enabled: boolean) {
  return useQuery({
    enabled: enabled && Boolean(wsId),
    queryFn: () => integrationsService.channels(wsId),
    queryKey: integrationKeys.channels(wsId),
    // 0: kênh được tạo/đổi tên/lưu trữ ở feature `channels` — không ai làm mới khoá riêng này, mở tấm chọn là tải lại nền.
    staleTime: 0,
  });
}

/** Nhóm chat (GROUP) để chọn làm nơi nhận — chỉ tải khi tấm chọn đang mở, như `useTargetChannels`. */
export function useTargetGroupChats(wsId: string, enabled: boolean) {
  return useQuery({
    enabled: enabled && Boolean(wsId),
    queryFn: () => integrationsService.groupChats(wsId),
    queryKey: integrationKeys.conversations(wsId),
  });
}

/** Log sự kiện — cuộn vô hạn theo cursor, lọc trạng thái. */
export function useIntegrationEvents(id: string, status?: WebhookEventStatus) {
  return useInfiniteQuery({
    enabled: Boolean(id),
    getNextPageParam: (last: EventsPage) => last.nextCursor,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => integrationsService.events(id, pageParam, status),
    queryKey: integrationKeys.events(id, status),
  });
}

export function useMyIntegrations() {
  return useQuery({ queryFn: integrationsService.mine, queryKey: integrationKeys.me() });
}

/** `PATCH /integrations/:id` — thành công ghi đè cache chi tiết; lỗi (409 `RES_003`) → tải lại để có `version` mới. */
export function useUpdateIntegration(id: string, wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateIntegrationInput) => integrationsService.update(id, input),
    onSuccess: (view: IntegrationView) => {
      qc.setQueryData(integrationKeys.detail(id), view);
      showToast('success', 'Đã lưu cấu hình tích hợp.');
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: integrationKeys.list(wsId) });
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: integrationKeys.detail(id) });
    },
  });
}

export function useDisconnectIntegration(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => integrationsService.disconnect(id),
    onSuccess: () => {
      showToast('success', 'Đã ngắt kết nối.');
      void qc.invalidateQueries({ queryKey: integrationKeys.list(wsId) });
    },
  });
}

export function useReplayEvent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => integrationsService.replay(id, eventId),
    onSuccess: () => {
      showToast('success', 'Đã xếp phát lại sự kiện.');
      void qc.invalidateQueries({ queryKey: integrationKeys.eventsAll(id) });
    },
  });
}

export function useDisconnectCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => integrationsService.disconnectCalendar(id),
    onSuccess: () => {
      showToast('success', 'Đã ngắt Google Calendar.');
      void qc.invalidateQueries({ queryKey: integrationKeys.me() });
    },
  });
}
