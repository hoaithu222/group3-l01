import { reduceCall } from '../../store/call-signal.reducer';
import { INITIAL_CALL_STATE, type CallSessionState, type CallSignal } from '../../store/call-signal.types';
import { makeParticipant, makeRoomCall } from './helpers';

/** Máy trạng thái cuộc gọi với phòng thoại kênh (mode ROOM, p2-03): không đổ chuông, chủ phòng đổi, tên người vào. */

const NOW = 1_800_000_000_000;
const token = { expiresAt: '2026-09-25T10:10:00.000Z', livekitUrl: 'wss://lk', token: 'jwt' };

function apply(state: CallSessionState, ...signals: CallSignal[]): CallSessionState {
  return signals.reduce((acc, s) => reduceCall(acc, s, NOW), state);
}
const started = () => apply(INITIAL_CALL_STATE, { clientCallId: 'c1', type: 'START_BEGIN' }, { call: makeRoomCall(), joined: false, token, type: 'START_OK' });

describe('START_OK cho phòng ROOM', () => {
  it('người TẠO phiên (joined:false) vào thẳng `connecting` — không có pha `outgoing`/đổ chuông; sau media kết nối → `active`', () => {
    const state = started();
    expect(state.phase).toBe('connecting');
    expect(state.token).toEqual(token);
    expect(apply(state, { type: 'MEDIA_CONNECTED' }).phase).toBe('active');
  });

  it('cuộc gọi RING mới tạo (joined:false) vẫn là `outgoing` (không đổi hành vi cũ)', () => {
    const ring = makeRoomCall({ mode: 'RING', scope: { avatarUrl: null, kind: 'DIRECT', title: 'Nam' } });
    const state = apply(INITIAL_CALL_STATE, { clientCallId: 'c1', type: 'START_BEGIN' }, { call: ring, joined: false, token, type: 'START_OK' });
    expect(state.phase).toBe('outgoing');
  });
});

describe('HOST_CHANGED', () => {
  it('đổi hostId, nhận version mới; bỏ tín hiệu cũ hơn hoặc của phòng khác', () => {
    const state = started();
    const next = apply(state, { callId: 'call1', hostId: 'me', type: 'HOST_CHANGED', version: 3 });
    expect(next.call?.hostId).toBe('me');
    expect(next.version).toBe(3);

    expect(apply(next, { callId: 'call1', hostId: 'host', type: 'HOST_CHANGED', version: 2 }).call?.hostId).toBe('me'); // version cũ
    expect(apply(next, { callId: 'khac', hostId: 'host', type: 'HOST_CHANGED', version: 9 }).call?.hostId).toBe('me'); // phòng khác
  });
});

describe('PARTICIPANT_UPDATED (bản đầy đủ của phòng ROOM)', () => {
  it('người MỚI vào hiện ĐÚNG tên/avatar ngay (BE gửi kèm) — không hiện tên rỗng chờ tải lại chi tiết', () => {
    const state = apply(started(), {
      callId: 'call1',
      participant: { avatarUrl: 'https://a/b.png', handRaisedAt: null, mutedByHost: false, name: 'Lan', role: 'MEMBER', state: 'CONNECTED', userId: 'lan' },
      type: 'PARTICIPANT_UPDATED',
      version: 1,
    });
    expect(state.call?.participants.find((p) => p.userId === 'lan')).toMatchObject({ avatarUrl: 'https://a/b.png', name: 'Lan', state: 'CONNECTED' });
  });

  it('bản vá KHÔNG mang tên/avatar (cuộc gọi RING, giơ tay...) không xoá tên đã biết', () => {
    const state = apply(started(), {
      callId: 'call1',
      participant: { handRaisedAt: '2026-09-25T10:01:00.000Z', mutedByHost: true, role: 'MEMBER', state: 'CONNECTED', userId: 'me' },
      type: 'PARTICIPANT_UPDATED',
      version: 1,
    });
    expect(state.call?.participants.find((p) => p.userId === 'me')).toMatchObject({ handRaisedAt: '2026-09-25T10:01:00.000Z', mutedByHost: true, name: 'Người me' });
  });

  it('giữ nguyên các người khác; screenSharing cập nhật khi có', () => {
    const base = apply(started(), {
      callId: 'call1',
      participant: { handRaisedAt: null, mutedByHost: false, role: 'MEMBER', screenSharing: true, state: 'CONNECTED', userId: 'me' },
      type: 'PARTICIPANT_UPDATED',
      version: 1,
    });
    expect(base.call?.participants.map((p) => p.userId)).toEqual(['host', 'me']);
    expect(base.call?.participants.find((p) => p.userId === 'me')?.screenSharing).toBe(true);
    expect(base.call?.participants.find((p) => p.userId === 'host')).toEqual(makeParticipant({ role: 'HOST', userId: 'host' }));
  });
});

describe('kết thúc phía máy này với lý do phòng', () => {
  it.each(['REMOVED_BY_HOST', 'MOVED_DEVICE', 'HOST_ENDED'] as const)('LOCAL_ENDED %s → phase ended kèm lý do', (reason) => {
    const state = apply(started(), { type: 'MEDIA_CONNECTED' }, { reason, type: 'LOCAL_ENDED' });
    expect(state.phase).toBe('ended');
    expect(state.endedInfo?.reason).toBe(reason);
    expect(state.token).toBeNull();
  });
});
