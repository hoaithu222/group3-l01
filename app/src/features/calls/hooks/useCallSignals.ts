import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { getDeviceId } from '@/core/device/device-id';
import { SocketEvent, useConnectionState, useSocketEvent } from '@/core/socket';
import type { PermissionRevokedPayload } from '@/core/socket';
import { useAppActive } from '@/shared/hooks/useAppActive';
import { useAuthStore } from '@/shell/store/slices/auth';

import type {
  CallAcceptedPayload,
  CallAnsweredElsewherePayload,
  CallCancelledPayload,
  CallDeclinedPayload,
  CallEndedPayload,
  CallIncomingPayload,
  CallParticipantUpdatedPayload,
} from '../api/calls.socket.types';
import { callKeys } from '../api/calls.keys';
import { callsService } from '../api/calls.service';
import { callStoreApi } from '../store/call.store';
import {
  onAccepted,
  onAnsweredElsewhere,
  onCancelled,
  onDeclined,
  onEnded,
  onIncoming,
  onParticipantUpdated,
  onPermissionRevoked,
  type CallSocketContext,
} from './call-socket-handlers';

/**
 * Nối socket `call:*` + đồng bộ lại `GET /me/active-call` vào `callStore`. Mount MỘT lần ở `app/(app)/_layout.tsx`
 * (không trong màn) để nhận cuộc gọi ở MỌI màn — cùng mẫu `useConversationSocket`/`useSavedSync`.
 *
 * Nguồn thứ hai (push/CallKit — p2-02) sẽ `dispatch` cùng `CallSignal` vào cùng store; bộ hợp nhất theo `callId`/`version`
 * lo chuyện hai nguồn cùng báo một cuộc gọi.
 */
export function useCallSignals(): void {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id) ?? null;
  const deviceIdRef = useRef<string | null>(null);

  useEffect(() => {
    void getDeviceId().then((id) => {
      deviceIdRef.current = id;
    });
  }, []);

  // Dựng lúc sự kiện tới (không phải lúc render) để luôn thấy `deviceId`/`userId` mới nhất.
  const context = (): CallSocketContext => ({
    deviceId: deviceIdRef.current,
    dispatch: callStoreApi.dispatch,
    queryClient,
    read: callStoreApi.get,
    userId,
  });

  useSocketEvent<CallIncomingPayload>(SocketEvent.CALL_INCOMING, (p) => onIncoming(context(), p));
  useSocketEvent<CallAcceptedPayload>(SocketEvent.CALL_ACCEPTED, (p) => onAccepted(context(), p));
  useSocketEvent<CallDeclinedPayload>(SocketEvent.CALL_DECLINED, (p) => onDeclined(context(), p));
  useSocketEvent<CallAnsweredElsewherePayload>(SocketEvent.CALL_ANSWERED_ELSEWHERE, (p) =>
    onAnsweredElsewhere(context(), p),
  );
  useSocketEvent<CallCancelledPayload>(SocketEvent.CALL_CANCELLED, (p) => onCancelled(context(), p));
  useSocketEvent<CallEndedPayload>(SocketEvent.CALL_ENDED, (p) => onEnded(context(), p));
  useSocketEvent<CallParticipantUpdatedPayload>(SocketEvent.CALL_PARTICIPANT_UPDATED, (p) =>
    onParticipantUpdated(context(), p),
  );
  useSocketEvent<PermissionRevokedPayload>(SocketEvent.PERMISSION_REVOKED, (p) =>
    onPermissionRevoked(context(), p),
  );

  // Socket nối lại / app về foreground ⇒ hỏi BE (nguồn sự thật): có thể đã lỡ `call:*` lúc mất kết nối.
  const connection = useConnectionState();
  const appState = useAppActive();
  useEffect(() => {
    if (connection !== 'connected' || appState !== 'active') return;
    void queryClient
      .fetchQuery({ queryFn: () => callsService.getMyActive(), queryKey: callKeys.myActive, staleTime: 0 })
      .then((mine) => callStoreApi.dispatch({ call: mine.call, type: 'SYNC' }))
      .catch(() => undefined); // mất mạng: giữ trạng thái hiện có, lần nối lại sau sẽ đồng bộ
  }, [connection, appState, queryClient]);
}
