import type { QueryClient } from '@tanstack/react-query';

import { callKeys } from '../../api/calls.keys';
import { callsService } from '../../api/calls.service';
import type { CallParticipantDto } from '../../api/calls.types';
import { callStoreApi } from '../../store/call.store';
import { classifyCallError, type CallFailure } from '../../utils/call-errors';
import { voiceRoomKeys } from '../api/voice-room.keys';
import { voiceRoomService } from '../api/voice-room.service';
import type { HostAction, LeaveRoomPayload } from '../api/voice-room.types';

/**
 * Hành động của người trong phòng thoại kênh — hàm THUẦN (không React) như `call-actions.ts`, test bằng service giả. Trả `null` khi xong,
 * `CallFailure` khi cần báo người dùng.
 */

const LEAVE_ATTEMPTS = 3;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function refresh(queryClient: QueryClient | undefined, channelId?: string): void {
  if (!queryClient) return;
  void queryClient.invalidateQueries({ queryKey: callKeys.myActive });
  void queryClient.invalidateQueries({ queryKey: callKeys.historyAll });
  void queryClient.invalidateQueries({ queryKey: channelId ? voiceRoomKeys.preview(channelId) : voiceRoomKeys.all });
}

/**
 * Giơ/hạ tay: cập nhật NGAY (optimistic, thời điểm ước lượng bằng đồng hồ server đã quy đổi) để nút đổi trạng thái tức thì; server đặt
 * `handRaisedAt` THẬT rồi phát lại `call:participant-updated` ghi đè. Lỗi → hoàn nguyên giá trị cũ.
 */
export async function setHandRaised(meId: string, raised: boolean): Promise<CallFailure | null> {
  const state = callStoreApi.get();
  const me = state.call?.participants.find((p) => p.userId === meId);
  if (!state.callId || !me) return null;
  const patch = (handRaisedAt: string | null) =>
    callStoreApi.dispatch({
      callId: state.callId as string,
      participant: { handRaisedAt, mutedByHost: me.mutedByHost, role: me.role, state: me.state, userId: meId },
      type: 'PARTICIPANT_UPDATED',
      version: state.version,
    });
  patch(raised ? new Date(Date.now() + state.serverOffsetMs).toISOString() : null);
  try {
    await voiceRoomService.setHand(state.callId, raised);
    return null;
  } catch (error) {
    patch(me.handRaisedAt);
    return classifyCallError(error);
  }
}

/**
 * Thao tác của chủ phòng — KHÔNG optimistic (thao tác quyền, chờ server). Mang `expectedVersion` = `Call.version` đang biết; lệch
 * (`CALL_011`) → tải lại phòng để lần thử sau đúng version, người dùng thấy "Trạng thái phòng đã thay đổi".
 */
export async function runHostAction(action: HostAction, target: CallParticipantDto | null): Promise<CallFailure | null> {
  const { callId, version } = callStoreApi.get();
  if (!callId) return null;
  try {
    const call = await voiceRoomService.hostAction(callId, action, { expectedVersion: version, targetUserId: target?.userId });
    callStoreApi.dispatch({ call, type: 'SYNC' });
    return null;
  } catch (error) {
    const failure = classifyCallError(error);
    if (failure.kind === 'STATE_CHANGED') {
      await callsService
        .get(callId)
        .then((call) => callStoreApi.dispatch({ call, type: 'SYNC' }))
        .catch(() => undefined);
    }
    return failure;
  }
}

/**
 * Rời phòng (chủ phòng kèm chọn người nhận/kết thúc). Kết thúc phía máy này NGAY (ngắt media — người dùng đã chọn dừng, UI không được
 * kẹt); lệnh `leave` gửi nền, thử tối đa 3 lần khi mất mạng — quá ba lần thì để BE đối soát (participant tự về `LEFT`).
 */
export async function leaveRoom(options: LeaveRoomPayload, queryClient?: QueryClient): Promise<void> {
  const { call, callId, phase } = callStoreApi.get();
  if (!callId || (phase !== 'connecting' && phase !== 'active')) return;
  callStoreApi.dispatch({ reason: options.endForEveryone ? 'HOST_ENDED' : 'LEFT', type: 'LOCAL_ENDED' });
  for (let attempt = 1; attempt <= LEAVE_ATTEMPTS; attempt += 1) {
    try {
      await voiceRoomService.leaveRoom(callId, options);
      break;
    } catch (error) {
      // Lỗi nghiệp vụ (đã ở ngoài phòng, phòng đã kết thúc…) → không thử lại; chỉ mạng/5xx mới đáng thử lại.
      if (classifyCallError(error).kind !== 'OFFLINE' || attempt === LEAVE_ATTEMPTS) break;
      await wait(1000 * attempt);
    }
  }
  refresh(queryClient, call?.scopeId);
}
