import { INITIAL_CALL_STATE, type CallSessionState, type CallSignal } from './call-signal.types';
import { RING_TIMEOUT_MS, offsetOf, viewOf } from './call-signal.helpers';
import { LIVE_PHASES, TAGGED_SIGNAL_TYPES, reduceTagged, toEnded, type TaggedSignal } from './call-signal.tagged';

/**
 * MÁY TRẠNG THÁI cuộc gọi phía client — hàm THUẦN `(state, signal, now) → state` (README p2-01 §5). Mọi nguồn
 * (socket, REST, media, người dùng) đi qua MỘT chỗ này nên "signal đến sai thứ tự" được xử lý ở đúng một nơi:
 *
 *  · khác `callId` khi đang có cuộc gọi ⇒ bỏ qua (server đã đánh BUSY cho cuộc mới — client KHÔNG tự decline);
 *  · `version` nhỏ hơn đã áp dụng ⇒ bỏ qua; bằng ⇒ áp lại vô hại (idempotent); lớn hơn ⇒ áp dụng;
 *  · tín hiệu tới TRƯỚC khi `POST /calls` trả về (chưa biết `callId`) ⇒ xếp vào `pending`, phát lại khi có.
 */

const isTagged = (signal: CallSignal): signal is TaggedSignal => TAGGED_SIGNAL_TYPES.has(signal.type);

function replayPending(state: CallSessionState, now: number): CallSessionState {
  const buffered = state.pending.filter((s) => 'callId' in s && s.callId === state.callId);
  const ordered = buffered.slice().sort((a, b) => ('version' in a && 'version' in b ? a.version - b.version : 0));
  const start: CallSessionState = { ...state, pending: [] };
  return ordered.reduce<CallSessionState>((acc, s) => reduceCall(acc, s, now), start);
}

export function reduceCall(state: CallSessionState, signal: CallSignal, now: number = Date.now()): CallSessionState {
  if (isTagged(signal)) {
    if (state.starting && state.callId === null) return { ...state, pending: [...state.pending, signal] };
    if (state.callId !== signal.callId) return state;
    if ('version' in signal && signal.version < state.version) return state;
    return reduceTagged(state, signal, now);
  }

  switch (signal.type) {
    case 'START_BEGIN':
      if (state.starting || LIVE_PHASES.has(state.phase)) return state;
      return {
        ...INITIAL_CALL_STATE,
        clientCallId: signal.clientCallId,
        direction: 'OUTGOING',
        serverOffsetMs: state.serverOffsetMs,
        starting: true,
      };
    case 'START_FAILED':
      return { ...state, direction: null, pending: [], phase: 'idle', starting: false };
    case 'START_OK': {
      const { call } = signal;
      const base: CallSessionState = {
        ...state,
        answering: false,
        call,
        callId: call.id,
        direction: 'OUTGOING',
        endedInfo: null,
        incoming: null,
        // Phòng thoại kênh (mode ROOM, p2-03) không đổ chuông: vào thẳng `connecting` dù là người tạo phiên (`joined:false`).
        phase: signal.joined || call.mode === 'ROOM' ? 'connecting' : 'outgoing',
        serverOffsetMs: offsetOf(call.serverNow, now),
        starting: false,
        token: signal.token,
        version: call.version,
      };
      if (call.status === 'ENDED') return toEnded(base, call.endReason ?? 'FAILED', now, call.durationSec);
      return replayPending(base, now);
    }
    case 'INCOMING': {
      if (state.starting || LIVE_PHASES.has(state.phase)) {
        // Cùng cuộc gọi qua nguồn thứ hai (socket + push): chỉ cập nhật, không tạo lần đổ chuông thứ hai.
        if (state.phase === 'incoming' && state.callId === signal.view.id) {
          return { ...state, incoming: signal.view, version: Math.max(state.version, signal.version) };
        }
        return state;
      }
      if (state.phase === 'ended' && state.callId === signal.view.id) return state;
      const offset = offsetOf(signal.serverNow, now);
      return {
        ...INITIAL_CALL_STATE,
        callId: signal.view.id,
        direction: 'INCOMING',
        incoming: signal.view,
        phase: 'incoming',
        ringExpiresAt: Date.parse(signal.expiresAt) - offset,
        serverOffsetMs: offset,
        version: signal.version,
      };
    }
    case 'ANSWER_BEGIN':
      return state.phase === 'incoming' && !state.answering ? { ...state, answering: true } : state;
    case 'ANSWER_FAILED':
      return { ...state, answering: false };
    case 'ANSWER_OK': {
      const { call } = signal;
      if (state.callId !== call.id) return state;
      const next: CallSessionState = {
        ...state,
        answering: false,
        call,
        incoming: null,
        phase: 'connecting',
        ringExpiresAt: null,
        serverOffsetMs: offsetOf(call.serverNow, now),
        token: signal.token,
        version: Math.max(state.version, call.version),
      };
      return call.status === 'ENDED' ? toEnded(next, call.endReason ?? 'FAILED', now, call.durationSec) : next;
    }
    case 'SYNC': {
      const { call } = signal;
      if (call === null) {
        // Đang chờ REST (đang tạo/đang trả lời) thì `null` có thể là dữ liệu cũ — không kết luận.
        if (state.starting || state.answering || !LIVE_PHASES.has(state.phase)) return state;
        return toEnded(state, 'SYNC_LOST', now);
      }
      if (state.phase === 'idle' && call.myActions.canAnswer && call.status !== 'ENDED') {
        return reduceCall(
          state,
          { expiresAt: new Date(Date.parse(call.startedAt) + RING_TIMEOUT_MS).toISOString(), serverNow: call.serverNow, type: 'INCOMING', version: call.version, view: viewOf(call) },
          now,
        );
      }
      if (state.callId !== call.id || call.version < state.version) return state;
      const synced = { ...state, call, serverOffsetMs: offsetOf(call.serverNow, now), version: call.version };
      if (call.status === 'ENDED') return toEnded(synced, call.endReason ?? 'FAILED', now, call.durationSec);
      // Đang đổ chuông mà BE nói mình không còn trả lời được (huỷ/hết giờ/nhận ở máy khác) ⇒ ngừng chuông.
      if (state.phase === 'incoming' && !call.myActions.canAnswer) return toEnded(synced, 'SYNC_LOST', now);
      return synced;
    }
    case 'MEDIA_CONNECTED':
      return state.phase === 'connecting' ? { ...state, phase: 'active' } : state;
    case 'MEDIA_FAILED':
      return LIVE_PHASES.has(state.phase) ? toEnded(state, 'CONNECT_FAILED', now) : state;
    case 'TOKEN_RENEWED':
      return { ...state, token: signal.token };
    case 'LOCAL_ENDED':
      return LIVE_PHASES.has(state.phase) ? toEnded(state, signal.reason, now) : state;
    case 'MINIMIZE':
      return LIVE_PHASES.has(state.phase) ? { ...state, minimized: signal.minimized } : state;
    case 'DISMISS':
      return state.phase === 'ended' ? { ...INITIAL_CALL_STATE, serverOffsetMs: state.serverOffsetMs } : state;
    case 'RESET':
      return { ...INITIAL_CALL_STATE };
  }
}
