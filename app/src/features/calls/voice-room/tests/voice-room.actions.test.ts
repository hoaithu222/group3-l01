import { callsService } from '../../api/calls.service';
import { callStoreApi } from '../../store/call.store';
import { voiceRoomService } from '../api/voice-room.service';
import { leaveRoom, runHostAction, setHandRaised } from '../hooks/voice-room.actions';
import { apiError, makeParticipant, makeRoomCall } from './helpers';

/** Hành động trong phòng (app.md §4, §8): giơ tay optimistic + hoàn nguyên, host action mang expectedVersion + CALL_011, rời phòng thử lại nền. */
jest.mock('../api/voice-room.service', () => ({
  voiceRoomService: { getPreview: jest.fn(), hostAction: jest.fn(), leaveRoom: jest.fn(), setHand: jest.fn() },
}));
jest.mock('../../api/calls.service', () => ({ callsService: { get: jest.fn() } }));

const token = { expiresAt: '2026-09-25T10:10:00.000Z', livekitUrl: 'wss://lk', token: 'jwt' };
const svc = jest.mocked(voiceRoomService);

function enterRoom(version = 4) {
  callStoreApi.dispatch({ type: 'RESET' });
  callStoreApi.dispatch({ clientCallId: 'c', type: 'START_BEGIN' });
  callStoreApi.dispatch({ call: makeRoomCall({ version }), joined: false, token, type: 'START_OK' });
  callStoreApi.dispatch({ type: 'MEDIA_CONNECTED' });
}
const me = () => callStoreApi.get().call?.participants.find((p) => p.userId === 'me');

beforeEach(() => {
  jest.clearAllMocks();
  enterRoom();
});

describe('setHandRaised', () => {
  it('giơ tay: cập nhật NGAY (chưa chờ server) rồi gọi API; hạ tay → null', async () => {
    let release: () => void = () => undefined;
    svc.setHand.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));
    const pending = setHandRaised('me', true);
    expect(me()?.handRaisedAt).not.toBeNull(); // optimistic
    release();
    expect(await pending).toBeNull();
    expect(svc.setHand).toHaveBeenCalledWith('call1', true);

    svc.setHand.mockResolvedValueOnce(undefined);
    await setHandRaised('me', false);
    expect(me()?.handRaisedAt).toBeNull();
  });

  it('lỗi → hoàn nguyên đúng giá trị cũ và trả lỗi để báo người dùng', async () => {
    svc.setHand.mockRejectedValueOnce(apiError(403, 'CALL_014'));
    const failure = await setHandRaised('me', true);
    expect(failure).toMatchObject({ kind: 'NOT_IN_ROOM' });
    expect(me()?.handRaisedAt).toBeNull();
  });

  it('thời điểm optimistic dùng đồng hồ SERVER đã quy đổi (serverOffsetMs), không đồng hồ thô của máy', async () => {
    const offset = callStoreApi.get().serverOffsetMs;
    svc.setHand.mockResolvedValueOnce(undefined);
    const before = Date.now() + offset;
    await setHandRaised('me', true);
    const stamped = Date.parse(me()?.handRaisedAt ?? '');
    expect(stamped).toBeGreaterThanOrEqual(before - 1);
    expect(stamped).toBeLessThanOrEqual(Date.now() + offset + 1);
  });
});

describe('runHostAction', () => {
  it('gửi expectedVersion = Call.version đang biết + đích; thành công → đồng bộ lại phòng (version mới)', async () => {
    const after = makeRoomCall({ participants: [makeParticipant({ mutedByHost: true, role: 'HOST', userId: 'host' })], version: 5 });
    svc.hostAction.mockResolvedValueOnce(after);
    const target = makeParticipant({ userId: 'lan' });
    expect(await runHostAction('BLOCK_AUDIO', target)).toBeNull();
    expect(svc.hostAction).toHaveBeenCalledWith('call1', 'BLOCK_AUDIO', { expectedVersion: 4, targetUserId: 'lan' });
    expect(callStoreApi.get().version).toBe(5);
  });

  it('`end`/`transfer`: đích tuỳ action; không có đích thì không gửi targetUserId', async () => {
    svc.hostAction.mockResolvedValue(makeRoomCall({ version: 5 }));
    await runHostAction('END', null);
    expect(svc.hostAction).toHaveBeenCalledWith('call1', 'END', { expectedVersion: 4, targetUserId: undefined });
  });

  it('CALL_011 (version lệch) → tải lại phòng để lần thử sau đúng version, trả STATE_CHANGED', async () => {
    svc.hostAction.mockRejectedValueOnce(apiError(409, 'CALL_011', { currentVersion: 7 }));
    jest.mocked(callsService.get).mockResolvedValueOnce(makeRoomCall({ hostId: 'lan', version: 7 }));
    const failure = await runHostAction('REMOVE', makeParticipant({ userId: 'x' }));
    expect(failure).toMatchObject({ kind: 'STATE_CHANGED' });
    expect(callStoreApi.get()).toMatchObject({ version: 7 });
    expect(callStoreApi.get().call?.hostId).toBe('lan');
  });

  it('CALL_015/CALL_014/CALL_019 → lỗi có nhãn riêng (không phải chủ phòng / không còn trong phòng / đích không hợp lệ)', async () => {
    for (const [code, kind] of [['CALL_015', 'NOT_HOST'], ['CALL_014', 'NOT_IN_ROOM'], ['CALL_019', 'INVALID_TARGET']] as const) {
      svc.hostAction.mockRejectedValueOnce(apiError(403, code));
      expect(await runHostAction('TRANSFER', makeParticipant({ userId: 'x' }))).toMatchObject({ kind });
    }
  });
});

describe('leaveRoom', () => {
  it('ngắt phía máy này NGAY (trước khi API xong); chủ phòng gửi lựa chọn chuyển quyền', async () => {
    let release: () => void = () => undefined;
    svc.leaveRoom.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve(makeRoomCall()))));
    const done = leaveRoom({ transferToUserId: 'lan' });
    expect(callStoreApi.get()).toMatchObject({ endedInfo: { reason: 'LEFT' }, phase: 'ended' });
    release();
    await done;
    expect(svc.leaveRoom).toHaveBeenCalledWith('call1', { transferToUserId: 'lan' });
  });

  it('"Kết thúc cho mọi người" → lý do HOST_ENDED + endForEveryone', async () => {
    svc.leaveRoom.mockResolvedValueOnce(makeRoomCall());
    await leaveRoom({ endForEveryone: true });
    expect(callStoreApi.get().endedInfo?.reason).toBe('HOST_ENDED');
    expect(svc.leaveRoom).toHaveBeenCalledWith('call1', { endForEveryone: true });
  });

  it('mất mạng → vẫn đã ngắt media, thử lại nền tối đa 3 lần rồi bỏ (BE đối soát); lỗi nghiệp vụ không thử lại', async () => {
    jest.useFakeTimers();
    const networkError = Object.assign(new Error('mạng'), { isAxiosError: true });
    svc.leaveRoom.mockRejectedValue(networkError);
    const done = leaveRoom({});
    await jest.advanceTimersByTimeAsync(10_000);
    await done;
    expect(svc.leaveRoom).toHaveBeenCalledTimes(3);
    jest.useRealTimers();

    enterRoom();
    svc.leaveRoom.mockReset().mockRejectedValue(apiError(403, 'CALL_014'));
    await leaveRoom({});
    expect(svc.leaveRoom).toHaveBeenCalledTimes(1);
  });

  it('không ở trong phòng (idle) → không làm gì', async () => {
    callStoreApi.dispatch({ type: 'RESET' });
    await leaveRoom({});
    expect(svc.leaveRoom).not.toHaveBeenCalled();
  });
});
