import { useQueryClient } from '@tanstack/react-query';

import { SocketEvent, useSocketEvent } from '@/core/socket';

import { integrationKeys } from '../queries/integrations.queries';

interface IntegrationUpdatedEvent {
  integrationId?: string;
  workspaceId?: string;
}

/**
 * `integration:updated` (BE phát tới OWNER/ADMIN — đổi trạng thái/cấu hình, lỗi đích, thu hồi) → làm mới danh sách của nhóm + chi tiết + log.
 * Chỉ làm mới (không vá cache) — payload chỉ có trạng thái, còn màn cần cả cấu hình/kênh đích.
 */
export function useIntegrationSocket(wsId: string) {
  const qc = useQueryClient();
  useSocketEvent<IntegrationUpdatedEvent>(SocketEvent.INTEGRATION_UPDATED, (event) => {
    if (event.workspaceId && event.workspaceId !== wsId) return;
    void qc.invalidateQueries({ queryKey: integrationKeys.list(wsId) });
    if (event.integrationId) {
      void qc.invalidateQueries({ queryKey: integrationKeys.detail(event.integrationId) });
      void qc.invalidateQueries({ queryKey: integrationKeys.eventsAll(event.integrationId) });
    }
  });
}
