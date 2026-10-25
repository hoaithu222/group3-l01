import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { auditLogKeys } from '@/features/audit-log';
import { showToast } from '@/shared/utils/toast.utils';

import type { AdminConnectionsParams, AdminEventsParams } from '../types/integration.types';
import { integrationService } from './integration.service';

/** Query key admin tích hợp (admin.md p5-03 §3). */
export const integrationKeys = {
  all: ['integration'] as const,
  eventsAll: () => ['integration', 'events'] as const,
  events: (params: AdminEventsParams) => ['integration', 'events', params] as const,
  /** Nằm DƯỚI `eventsAll()` nên phát lại (invalidate `eventsAll`) làm mới luôn ngăn kéo chi tiết (chuỗi phát lại). */
  event: (id: string) => ['integration', 'events', 'detail', id] as const,
  providers: () => ['integration', 'providers'] as const,
  connections: (params: AdminConnectionsParams) => ['integration', 'connections', params] as const,
  /** Tab "Tích hợp" của workspace — cùng gốc `['integration']` nên phát lại/tắt-bật nhà cung cấp làm mới luôn. */
  workspace: (workspaceId: string) => ['integration', 'workspace', workspaceId] as const,
};

/** `GET /admin/integrations/events` (phân trang server). */
export const useWebhookEvents = (params: AdminEventsParams) =>
  useQuery({
    queryKey: integrationKeys.events(params),
    queryFn: () => integrationService.listEvents(params),
    placeholderData: keepPreviousData,
  });

/** `GET /admin/integrations/events/:id` — chỉ tải khi ngăn kéo mở. */
export const useWebhookEvent = (id: string | undefined) =>
  useQuery({
    queryKey: integrationKeys.event(id ?? ''),
    queryFn: () => integrationService.getEvent(id ?? ''),
    select: (res) => res.data,
    enabled: !!id,
    retry: false,
  });

/** `POST /admin/integrations/events/:id/replay` → 202; làm mới log + nhật ký. */
export const useReplayWebhookEvent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: integrationService.replayEvent,
    onSuccess: () => {
      showToast('success', 'Đã xếp phát lại sự kiện và ghi nhật ký');
      void qc.invalidateQueries({ queryKey: integrationKeys.eventsAll() });
      void qc.invalidateQueries({ queryKey: auditLogKeys.all });
    },
  });
};

/** `GET /admin/integrations/providers`. */
export const useIntegrationProviders = () =>
  useQuery({
    queryKey: integrationKeys.providers(),
    queryFn: integrationService.listProviders,
    select: (res) => res.data,
  });

/** `PUT /admin/integrations/providers/:provider` — làm mới cả khi lỗi (cấu hình có thể vừa đổi ở nơi khác). */
export const useToggleIntegrationProvider = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: integrationService.toggleProvider,
    onSuccess: (_res, vars) => {
      showToast(
        'success',
        vars.enabled ? 'Đã bật nhà cung cấp và ghi nhật ký' : 'Đã tắt nhà cung cấp và ghi nhật ký',
      );
      void qc.invalidateQueries({ queryKey: auditLogKeys.all });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: integrationKeys.providers() });
    },
  });
};

/** `GET /admin/integrations` — kết nối lỗi/thu hồi (chỉ đọc). */
export const useErrorConnections = (params: AdminConnectionsParams) =>
  useQuery({
    queryKey: integrationKeys.connections(params),
    queryFn: () => integrationService.listConnections(params),
    placeholderData: keepPreviousData,
  });

/** `GET /admin/workspaces/:id/integrations` — kết nối của một workspace (chỉ đọc). Chỉ mount khi cờ `integration` bật + có `integration:view`. */
export const useWorkspaceIntegrations = (workspaceId: string | undefined) =>
  useQuery({
    queryKey: integrationKeys.workspace(workspaceId ?? ''),
    queryFn: () => integrationService.listForWorkspace(workspaceId as string),
    enabled: !!workspaceId,
  });
