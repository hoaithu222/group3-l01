import { MAX_FLOATING_REACTIONS } from '../constants/meeting-room.constants';
import { initialMeetingRoom, meetingRoomApi, useMeetingRoomStore } from '../store/meeting-room.store';
import { makeJoined } from './fixtures';

/** Store phiên phòng họp (app.md §5): mặc định an toàn, ghi phiên `JOINED`, trần cảm xúc, reset sạch. */

beforeEach(() => meetingRoomApi.reset());

describe('meeting-room store', () => {
  it('mặc định: pre-join, mic/camera TẮT, chưa có phiên, loa ngoài (phòng nhiều người)', () => {
    const state = initialMeetingRoom();
    expect(state).toMatchObject({
      callId: null,
      camOn: false,
      meetingId: null,
      micOn: false,
      minimized: false,
      phase: 'PREJOIN',
      preJoin: { cam: false, listenOnly: false, mic: false },
      speakerOn: true,
      ticket: null,
    });
  });

  it('applyJoined ghi phiên: callId, vai trò, quyền publish, vé LiveKit (hạn tính ms), độ lệch giờ server', () => {
    meetingRoomApi.applyJoined(
      makeJoined({ callId: 'c9', closingAt: '2026-10-01T09:55:00.000Z', role: 'CO_HOST', tokenExpiresAt: '2026-10-01T09:10:00.000Z' }),
      1234,
    );
    expect(meetingRoomApi.get()).toMatchObject({
      callId: 'c9',
      closingAt: '2026-10-01T09:55:00.000Z',
      role: 'CO_HOST',
      serverOffsetMs: 1234,
      ticket: { expiresAt: Date.parse('2026-10-01T09:10:00.000Z'), token: 'jwt.token.value', url: 'ws://livekit.test' },
    });
  });

  it(`cảm xúc đang bay tối đa ${MAX_FLOATING_REACTIONS}: quá trần thì bỏ cái CŨ nhất; dropReaction gỡ đúng id`, () => {
    for (let i = 0; i < MAX_FLOATING_REACTIONS + 3; i += 1) {
      meetingRoomApi.addReaction({ at: i, emoji: '👍', id: `r${i}`, identity: 'u' });
    }
    const ids = meetingRoomApi.get().reactions.map((r) => r.id);
    expect(ids).toHaveLength(MAX_FLOATING_REACTIONS);
    expect(ids[0]).toBe('r3');
    expect(ids.at(-1)).toBe(`r${MAX_FLOATING_REACTIONS + 2}`);
    useMeetingRoomStore.getState().dropReaction('r3');
    expect(meetingRoomApi.get().reactions.map((r) => r.id)).not.toContain('r3');
  });

  it('reset trả về ban đầu và KHÔNG dùng chung tham chiếu `preJoin` giữa các lần (sửa lần này không rò sang lần sau)', () => {
    meetingRoomApi.patch({ callId: 'c1', chatUnread: 3, phase: 'IN_ROOM', preJoin: { ...meetingRoomApi.get().preJoin, mic: true } });
    meetingRoomApi.reset();
    expect(meetingRoomApi.get()).toMatchObject({ callId: null, chatUnread: 0, phase: 'PREJOIN', preJoin: { mic: false } });
    expect(initialMeetingRoom().preJoin).not.toBe(initialMeetingRoom().preJoin);
  });
});
