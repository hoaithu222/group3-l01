import { useQueryClient } from '@tanstack/react-query';

import { SocketEvent, useSocketEvent } from '@/core/socket';

import { discoveryKeys } from '../api/discovery.keys';
import type { DiscoveryScope } from '../api/discovery.types';

/** `pin:updated` (p1-04) — chỉ các trường `discovery` đọc. */
interface PinUpdatedPayload {
  messageId: string;
  scopeType: DiscoveryScope['scopeType'];
  scopeId: string;
}

/**
 * Realtime cho màn ghim/tìm của MỘT phạm vi (app.md p1-09 §4):
 *  · `pin:updated` đúng phạm vi → làm mới danh sách ghim (máy khác vừa ghim/bỏ ghim, hoặc chính mình ở màn chat).
 *  · `channel:revoked` / `conversation:removed` đúng phạm vi → `removeQueries` ghim + kết quả tìm: cache chứa NỘI DUNG tin,
 *    người vừa mất quyền không được còn thấy nó nằm trong bộ nhớ. Việc rời màn do layout phạm vi
 *    (`useChannelScope`/`useConversationScope`) lo — không nhân đôi điều hướng ở đây.
 */
export function useScopeDiscoverySocket(
  scope: Pick<DiscoveryScope, 'scopeId' | 'scopeType'>,
): void {
  const queryClient = useQueryClient();

  const dropScopeCache = () => {
    queryClient.removeQueries({ queryKey: discoveryKeys.pins(scope) });
    queryClient.removeQueries({ queryKey: discoveryKeys.searchScope(scope) });
  };

  useSocketEvent<PinUpdatedPayload>(SocketEvent.PIN_UPDATED, (payload) => {
    if (payload.scopeType === scope.scopeType && payload.scopeId === scope.scopeId) {
      void queryClient.invalidateQueries({ queryKey: discoveryKeys.pins(scope) });
    }
  });

  useSocketEvent<{ channelId: string }>(SocketEvent.CHANNEL_REVOKED, (payload) => {
    if (scope.scopeType === 'CHANNEL' && payload.channelId === scope.scopeId) dropScopeCache();
  });

  useSocketEvent<{ conversationId: string }>(SocketEvent.CONVERSATION_REMOVED, (payload) => {
    if (scope.scopeType === 'CONVERSATION' && payload.conversationId === scope.scopeId)
      dropScopeCache();
  });
}
