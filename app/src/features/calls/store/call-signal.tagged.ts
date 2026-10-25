import type { CallDto } from '../api/calls.types';
import type { CallEndedReason, CallParticipantPatch, CallPhase, CallSessionState, CallSignal } from './call-signal.types';

/** Nhánh của máy trạng thái xử lý tín hiệu do SERVER phát (mang `callId` + `version`) — tách khỏi reducer chính cho ≤ 150 dòng. */

export type TaggedSignal = Extract<
  CallSignal,
  {
    type:
      | 'ACCEPTED'
      | 'ANSWERED_ELSEWHERE'
      | 'CANCELLED'
      | 'DECLINED'
      | 'ENDED'
      | 'HOST_CHANGED'
      | 'PARTICIPANT_UPDATED'
      | 'REVOKED';
  }
>;

/** Loại tín hiệu do SERVER phát (mang `callId` + `version`) — reducer chính dùng để rẽ nhánh sang `reduceTagged`. */
export const TAGGED_SIGNAL_TYPES: ReadonlySet<CallSignal['type']> = new Set([
  'ACCEPTED',
  'ANSWERED_ELSEWHERE',
  'CANCELLED',
  'DECLINED',
  'ENDED',
  'HOST_CHANGED',
  'PARTICIPANT_UPDATED',
  'REVOKED',
]);

export const LIVE_PHASES: ReadonlySet<CallPhase> = new Set(['outgoing', 'incoming', 'connecting', 'active']);

/** Chuyển sang `ended` — dọn token/khoá bấm, giữ `callId`/`call` để màn "đã kết thúc" còn tên người/thời lượng. */
export function toEnded(
  state: CallSessionState,
  reason: CallEndedReason,
  now: number,
  durationSec: number | null = null,
): CallSessionState {
  return {
    ...state,
    answering: false,
    endedInfo: { at: now, durationSec, reason },
    minimized: false,
    pending: [],
    phase: 'ended',
    ringExpiresAt: null,
    starting: false,
    token: null,
  };
}

function patchParticipant(call: CallDto | null, patch: CallParticipantPatch): CallDto | null {
  if (!call) return call;
  if (!call.participants.some((p) => p.userId === patch.userId)) {
    return { ...call, participants: [...call.participants, { avatarUrl: null, name: '', ...patch }] };
  }
  // Chỉ ghi đè trường CÓ TRONG bản vá: payload cuộc gọi RING không mang tên/avatar, ghi `undefined` đè sẽ xoá mất tên đã biết.
  return {
    ...call,
    participants: call.participants.map((p) => (p.userId === patch.userId ? { ...p, ...patch } : p)),
  };
}

export function reduceTagged(state: CallSessionState, signal: TaggedSignal, now: number): CallSessionState {
  const version = 'version' in signal ? Math.max(state.version, signal.version) : state.version;
  const live = LIVE_PHASES.has(state.phase);

  switch (signal.type) {
    case 'ACCEPTED': {
      if (state.phase !== 'outgoing') return { ...state, version };
      const call = state.call?.status === 'RINGING' ? { ...state.call, status: 'ACTIVE' as const } : state.call;
      return { ...state, call, phase: 'active', version };
    }
    case 'DECLINED': {
      if (signal.byMe) return state.phase === 'incoming' ? toEnded({ ...state, version }, 'DECLINED_ELSEWHERE', now) : { ...state, version };
      const one = state.call?.scope.kind === 'DIRECT';
      if (state.phase === 'outgoing' && one) return toEnded({ ...state, version }, 'DECLINED', now);
      // Nhóm: người khác từ chối không kết thúc cuộc gọi — chỉ đổi trạng thái người đó (nếu đã biết).
      const call = state.call && {
        ...state.call,
        participants: state.call.participants.map((p) =>
          p.userId === signal.userId ? { ...p, state: 'DECLINED' as const } : p,
        ),
      };
      return { ...state, call, version };
    }
    case 'CANCELLED':
      return state.phase === 'incoming' || state.phase === 'outgoing'
        ? toEnded({ ...state, version }, signal.reason, now)
        : { ...state, version };
    case 'ENDED':
      return live ? toEnded({ ...state, version }, signal.endReason, now, signal.durationSec) : { ...state, version };
    case 'ANSWERED_ELSEWHERE':
      return state.phase === 'incoming' ? toEnded({ ...state, version }, 'ANSWERED_ELSEWHERE', now) : { ...state, version };
    case 'PARTICIPANT_UPDATED':
      return { ...state, call: patchParticipant(state.call, signal.participant), version };
    case 'HOST_CHANGED':
      return { ...state, call: state.call ? { ...state.call, hostId: signal.hostId } : state.call, version };
    case 'REVOKED':
      return live ? toEnded(state, 'REVOKED', now) : state;
  }
}
