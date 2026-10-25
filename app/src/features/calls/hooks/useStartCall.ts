import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';

import { getDeviceId } from '@/core/device/device-id';

import { callKeys } from '../api/calls.keys';
import { callsService } from '../api/calls.service';
import type { CallMediaKind, CallScopeRef } from '../api/calls.types';
import { callStoreApi } from '../store/call.store';
import { newClientCallId } from '../utils/client-call-id';
import { CALL_FAILURE_TEXT, classifyCallError, type CallFailure } from '../utils/call-errors';

/** `clientCallId` theo (phạm vi, loại) — thử lại thủ công sau mất mạng dùng LẠI cùng id nên BE trả cùng `callId` (CL-09). */
const attempts = new Map<string, string>();

export interface UseStartCall {
  dismissFailure: () => void;
  failure: CallFailure | null;
  /** Tham gia cuộc gọi ĐANG DIỄN RA (banner "Tham gia") — `POST /calls/:id/join`, không tạo cuộc mới. */
  join: (callId: string) => Promise<boolean>;
  pending: boolean;
  /** `true` khi đã tạo/tham gia được cuộc gọi và mở màn gọi; `false` khi có `failure` để hiện hộp thoại. */
  start: (scope: CallScopeRef, mediaKind: CallMediaKind) => Promise<boolean>;
}

/**
 * Bấm gọi (nút header, thẻ tóm tắt "Gọi lại", banner "Tham gia" đều đi qua đây): chặn khi đang ở cuộc gọi khác,
 * `POST /calls` idempotent, rồi mở `call/[callId]`. `joined:true` (nhóm đã có cuộc gọi thật) vào thẳng `connecting`
 * — không đổ chuông lại (CL-08). Lỗi trả về dạng `failure` cho `CallErrorDialogs`, KHÔNG toast.
 */
export function useStartCall(): UseStartCall {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<CallFailure | null>(null);

  const start = useCallback(
    async (scope: CallScopeRef, mediaKind: CallMediaKind): Promise<boolean> => {
      const current = callStoreApi.get();
      const busy = current.starting || (current.phase !== 'idle' && current.phase !== 'ended');
      if (busy) {
        setFailure({
          activeCallId: current.callId ?? undefined,
          kind: 'IN_OTHER_CALL',
          message: CALL_FAILURE_TEXT.IN_OTHER_CALL,
        });
        return false;
      }
      const key = `${scope.scopeType}:${scope.scopeId}:${mediaKind}`;
      const clientCallId = attempts.get(key) ?? newClientCallId();
      attempts.set(key, clientCallId);
      callStoreApi.dispatch({ clientCallId, type: 'START_BEGIN' });
      setPending(true);
      try {
        const result = await callsService.create({
          ...scope,
          clientCallId,
          deviceId: await getDeviceId(),
          mediaKind,
        });
        attempts.delete(key);
        callStoreApi.dispatch({ call: result.call, joined: result.joined, token: result.token, type: 'START_OK' });
        void queryClient.invalidateQueries({ queryKey: callKeys.historyAll });
        router.push({ params: { callId: result.call.id }, pathname: '/call/[callId]' });
        return true;
      } catch (error) {
        callStoreApi.dispatch({ type: 'START_FAILED' });
        const classified = classifyCallError(error);
        // Lỗi mạng: giữ id để "thử lại" là cùng một yêu cầu; mọi lỗi khác thì lần sau là ý định MỚI.
        if (classified.kind !== 'OFFLINE') attempts.delete(key);
        setFailure(classified);
        return false;
      } finally {
        setPending(false);
      }
    },
    [queryClient],
  );

  const join = useCallback(
    async (callId: string): Promise<boolean> => {
      const current = callStoreApi.get();
      if (current.starting || (current.phase !== 'idle' && current.phase !== 'ended')) {
        setFailure({ activeCallId: current.callId ?? undefined, kind: 'IN_OTHER_CALL', message: CALL_FAILURE_TEXT.IN_OTHER_CALL });
        return false;
      }
      setPending(true);
      try {
        const result = await callsService.join(callId, await getDeviceId());
        callStoreApi.dispatch({ call: result.call, joined: true, token: result.token, type: 'START_OK' });
        router.push({ params: { callId }, pathname: '/call/[callId]' });
        return true;
      } catch (error) {
        setFailure(classifyCallError(error));
        return false;
      } finally {
        setPending(false);
      }
    },
    [],
  );

  return { dismissFailure: () => setFailure(null), failure, join, pending, start };
}
