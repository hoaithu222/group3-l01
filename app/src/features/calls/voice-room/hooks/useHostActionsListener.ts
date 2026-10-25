import { useQueryClient } from '@tanstack/react-query';

import { useSocketEvent } from '@/core/socket';
import { useAuthStore } from '@/shell/store/slices/auth';

import { VOICE_HOST_ACTION_EVENT, type CallHostActionPayload } from '../../api/calls.socket.types';
import { handleHostAction } from './host-action-handler';

/**
 * Nghe `call:host-action` và áp tác động của chủ phòng lên máy này. Mount MỘT lần ở `CallHost` (không ở màn phòng): chủ phòng mời
 * ra/chặn mic khi phòng đang THU NHỎ vẫn phải ngắt media và báo người dùng.
 */
export function useHostActionsListener(): void {
  const queryClient = useQueryClient();
  const meId = useAuthStore((state) => state.user?.id) ?? null;
  useSocketEvent<CallHostActionPayload>(VOICE_HOST_ACTION_EVENT, (payload) => handleHostAction({ meId, queryClient }, payload));
}
