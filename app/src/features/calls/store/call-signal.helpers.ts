import type { CallDto, IncomingCallView } from '../api/calls.types';

/** Hàm thuần nhỏ cho `reduceCall` — tách ra để reducer ≤ 150 dòng. */

/** `LIMITS.call.ringTimeoutSeconds` của BE (45 s) — chỉ dùng khi dựng lại cuộc gọi đến từ `/me/active-call` (không có `expiresAt`). */
export const RING_TIMEOUT_MS = 45_000;

export function offsetOf(serverNow: string, now: number): number {
  const at = Date.parse(serverNow);
  return Number.isFinite(at) ? at - now : 0;
}

/** Dựng "cuộc gọi đến" từ `CallDto` — dùng khi đồng bộ lại qua `/me/active-call` mà không nhận được `call:incoming`. */
export function viewOf(call: CallDto): IncomingCallView {
  return {
    callUuid: call.callUuid,
    id: call.id,
    initiator: call.initiator,
    mediaKind: call.mediaKind,
    mode: call.mode,
    // Khác rỗng (trước chỉ để `[]`): `directPeerFallback` (CallScreen) cần danh sách này để dò đúng "người còn lại"
    // khi `scope.title` chưa kịp resolve — bản dựng qua `/me/active-call` (SYNC) không có sẵn `call:incoming` gốc.
    participantsPreview: call.participants.map((p) => ({ avatarUrl: p.avatarUrl, id: p.userId, name: p.name })),
    scope: call.scope,
    scopeId: call.scopeId,
    scopeType: call.scopeType,
    startedAt: call.startedAt,
    version: call.version,
    workspaceId: call.workspaceId,
  };
}

