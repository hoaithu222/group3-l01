import type { QueryClient } from '@tanstack/react-query';

import { getDeviceId } from '@/core/device/device-id';

import { callKeys } from '../api/calls.keys';
import { callsService } from '../api/calls.service';
import { callStoreApi } from '../store/call.store';
import { classifyCallError, type CallFailure } from '../utils/call-errors';

/**
 * Hành động của người dùng trên cuộc gọi hiện tại: gọi REST rồi cập nhật `callStore`. Hàm THUẦN (không React) để test
 * bằng service giả. Trả `null` khi thành công, `CallFailure` khi cần báo người dùng. Kết thúc phía client LUÔN xảy ra cho
 * `decline`/`cancel`/`leave` ngay cả khi REST lỗi — người dùng đã chọn dừng, UI không được kẹt ở màn đổ chuông.
 */

function refresh(queryClient: QueryClient | undefined): void {
  if (!queryClient) return;
  void queryClient.invalidateQueries({ queryKey: callKeys.myActive });
  void queryClient.invalidateQueries({ queryKey: callKeys.historyAll });
  void queryClient.invalidateQueries({ queryKey: ['calls', 'active'] });
}

export async function answerCall(queryClient?: QueryClient): Promise<CallFailure | null> {
  const { callId, phase } = callStoreApi.get();
  if (!callId || phase !== 'incoming') return null;
  callStoreApi.dispatch({ type: 'ANSWER_BEGIN' });
  try {
    const result = await callsService.answer(callId, await getDeviceId());
    callStoreApi.dispatch({ call: result.call, token: result.token, type: 'ANSWER_OK' });
    return null;
  } catch (error) {
    const failure = classifyCallError(error);
    if (failure.kind === 'ANSWERED_ELSEWHERE') {
      callStoreApi.dispatch({ reason: 'ANSWERED_ELSEWHERE', type: 'LOCAL_ENDED' });
    } else if (failure.kind === 'STATE_CHANGED' || failure.kind === 'ALREADY_ENDED') {
      callStoreApi.dispatch({ reason: 'CANCELLED', type: 'LOCAL_ENDED' }); // người gọi huỷ/hết giờ trước khi kịp trả lời
    } else {
      callStoreApi.dispatch({ type: 'ANSWER_FAILED' }); // lỗi mạng: cho thử lại, không bỏ cuộc gọi
    }
    return failure;
  } finally {
    refresh(queryClient);
  }
}

export async function declineCall(queryClient?: QueryClient): Promise<void> {
  const { callId, phase } = callStoreApi.get();
  if (!callId || phase !== 'incoming') return;
  callStoreApi.dispatch({ reason: 'DECLINED_LOCAL', type: 'LOCAL_ENDED' });
  await callsService.decline(callId, await getDeviceId()).catch(() => undefined);
  refresh(queryClient);
}

export async function cancelCall(queryClient?: QueryClient): Promise<void> {
  const { callId, phase } = callStoreApi.get();
  if (!callId || phase !== 'outgoing') return;
  callStoreApi.dispatch({ reason: 'CANCELLED_LOCAL', type: 'LOCAL_ENDED' });
  try {
    await callsService.cancel(callId);
  } catch {
    // Đã có người vào phòng (`CALL_011`) hoặc mạng lỗi: rời thay vì huỷ — kết quả cuối vẫn là mình ra khỏi cuộc gọi.
    await callsService.leave(callId).catch(() => undefined);
  }
  refresh(queryClient);
}

export async function leaveCall(queryClient?: QueryClient): Promise<void> {
  const { callId, phase } = callStoreApi.get();
  if (!callId || (phase !== 'connecting' && phase !== 'active')) return;
  callStoreApi.dispatch({ reason: 'LEFT', type: 'LOCAL_ENDED' });
  await callsService.leave(callId).catch(() => undefined);
  refresh(queryClient);
}

/** "Kết thúc cho mọi người" (nhóm: người gọi hoặc OWNER/ADMIN — `myActions.canEnd`; BE vẫn kiểm lại `CALL_015`). */
export async function endCallForEveryone(queryClient?: QueryClient): Promise<CallFailure | null> {
  const { callId, phase } = callStoreApi.get();
  if (!callId || (phase !== 'connecting' && phase !== 'active')) return null;
  try {
    await callsService.end(callId, true);
    callStoreApi.dispatch({ reason: 'COMPLETED', type: 'LOCAL_ENDED' });
    refresh(queryClient);
    return null;
  } catch (error) {
    return classifyCallError(error);
  }
}

/** Nút đỏ duy nhất: hành động phụ thuộc pha (đến → từ chối, đi → huỷ, đang gọi → rời). */
export async function hangUp(queryClient?: QueryClient): Promise<void> {
  const { phase } = callStoreApi.get();
  if (phase === 'incoming') return declineCall(queryClient);
  if (phase === 'outgoing') return cancelCall(queryClient);
  return leaveCall(queryClient);
}
