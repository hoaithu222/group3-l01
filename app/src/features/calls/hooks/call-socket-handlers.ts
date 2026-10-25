import type { QueryClient } from '@tanstack/react-query';

import type { PermissionRevokedPayload } from '@/core/socket';

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
import type { CallSessionState, CallSignal } from '../store/call-signal.types';
import { voiceRoomKeys } from '../voice-room/api/voice-room.keys';

/**
 * Handler THUẦN cho socket `call:*` (không React) — `useCallSignals` chỉ gắn chúng vào `useSocketEvent`. Tách ra để test
 * không cần dựng socket, và để mọi quy tắc "bỏ tín hiệu của chính máy này" nằm một chỗ (README p2-01 §4.2).
 */
export interface CallSocketContext {
  dispatch: (signal: CallSignal) => void;
  /** `deviceId` của máy này — `null` khi chưa đọc xong (coi như "không phải máy mình"). */
  deviceId: string | null;
  queryClient: QueryClient;
  read: () => CallSessionState;
  userId: string | null;
}

/** Banner "Tham gia", chi tiết cuộc gọi, lịch sử và `/me/active-call` đều có thể đã cũ sau một tín hiệu. */
function refreshCaches(ctx: CallSocketContext, callId?: string): void {
  void ctx.queryClient.invalidateQueries({ queryKey: ['calls', 'active'] });
  void ctx.queryClient.invalidateQueries({ queryKey: callKeys.myActive });
  if (callId) void ctx.queryClient.invalidateQueries({ queryKey: callKeys.detail(callId) });
}

export function onIncoming(ctx: CallSocketContext, p: CallIncomingPayload): void {
  // `ring:false` (nhóm > 16 người): KHÔNG đổ chuông — chỉ làm mới banner "Đang có cuộc gọi — Tham gia".
  if (!p.ring) {
    void ctx.queryClient.invalidateQueries({
      queryKey: callKeys.active(p.call.scopeType, p.call.scopeId),
    });
    return;
  }
  ctx.dispatch({ expiresAt: p.expiresAt, serverNow: p.serverNow, type: 'INCOMING', version: p.version, view: p.call });
}

export function onAccepted(ctx: CallSocketContext, p: CallAcceptedPayload): void {
  ctx.dispatch({ callId: p.callId, type: 'ACCEPTED', version: p.version });
  refreshCaches(ctx, p.callId);
}

export function onDeclined(ctx: CallSocketContext, p: CallDeclinedPayload): void {
  const byMe = p.userId === ctx.userId;
  // Chính máy này vừa từ chối: `useCallActions` đã tự kết thúc — bỏ tín hiệu dội lại (`originDeviceId` khớp).
  if (byMe && p.originDeviceId === ctx.deviceId) return;
  ctx.dispatch({ byMe, callId: p.callId, type: 'DECLINED', userId: p.userId, version: p.version });
  refreshCaches(ctx, p.callId);
}

export function onAnsweredElsewhere(ctx: CallSocketContext, p: CallAnsweredElsewherePayload): void {
  if (p.originDeviceId === ctx.deviceId) return; // máy mình vừa trả lời — không tự dừng chuông của mình
  ctx.dispatch({ callId: p.callId, type: 'ANSWERED_ELSEWHERE', version: p.version });
}

export function onCancelled(ctx: CallSocketContext, p: CallCancelledPayload): void {
  ctx.dispatch({ callId: p.callId, reason: p.reason, type: 'CANCELLED', version: p.version });
  // Người đang đổ chuông CHỈ nhận `call:cancelled` (không có `call:ended`, BE `call-signal.dispatcher.ts`): cuộc gọi nhỡ phải hiện
  // trong lịch sử, và banner "Đang có cuộc gọi" của nhóm (chuông của mình hết giờ nhưng cuộc gọi vẫn chạy) phải đúng.
  refreshCaches(ctx, p.callId);
  void ctx.queryClient.invalidateQueries({ queryKey: callKeys.historyAll });
}

export function onEnded(ctx: CallSocketContext, p: CallEndedPayload): void {
  ctx.dispatch({
    callId: p.callId,
    durationSec: p.durationSec,
    endReason: p.endReason,
    type: 'ENDED',
    version: p.version,
  });
  refreshCaches(ctx, p.callId);
  void ctx.queryClient.invalidateQueries({ queryKey: callKeys.historyAll });
}

export function onParticipantUpdated(ctx: CallSocketContext, p: CallParticipantUpdatedPayload): void {
  // Bản CÔNG KHAI của phòng thoại kênh (room `ch:{id}`, không có `role`) là của màn preview — không đưa vào state cuộc gọi của mình.
  if (p.participant.role) {
    ctx.dispatch({ callId: p.callId, participant: p.participant, type: 'PARTICIPANT_UPDATED', version: p.version });
  }
  void ctx.queryClient.invalidateQueries({ queryKey: ['calls', 'active'] });
}

/** Quyền thu hồi chạm tới cuộc gọi hiện tại (chính nó, hội thoại/kênh chứa nó, hoặc cả nhóm khi `cascade`) → `REVOKED`. */
export function onPermissionRevoked(ctx: CallSocketContext, p: PermissionRevokedPayload): void {
  // Preview phòng thoại (tên người đang trong phòng) của kênh/nhóm vừa mất quyền không được nằm lại trong cache (p2-03 app.md §5).
  if (p.scopeType === 'CHANNEL' || p.scopeType === 'WORKSPACE') ctx.queryClient.removeQueries({ queryKey: voiceRoomKeys.all });
  const { call, callId, incoming } = ctx.read();
  if (!callId) return;
  // Đang đổ chuông thì mới có `incoming`, chưa có `call` (chi tiết) — cả hai đều mang phạm vi.
  const target = call ?? incoming;
  const hit =
    (p.scopeType === 'CALL' && p.scopeId === callId) ||
    (target !== null && p.scopeType === target.scopeType && p.scopeId === target.scopeId) ||
    (target !== null && p.cascade && p.scopeType === 'WORKSPACE' && p.scopeId === target.workspaceId);
  if (hit) ctx.dispatch({ callId, type: 'REVOKED' });
}
