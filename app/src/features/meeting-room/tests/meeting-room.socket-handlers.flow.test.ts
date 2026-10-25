import { queryClient } from '@/core/config/query-client';
import { showToast } from '@/shared/utils/toast.utils';

import { meetingRoomKeys } from '../api/meeting-room.keys';
import { meetingRoomService } from '../api/meeting-room.service';
import { JOIN_RETRY_DEBOUNCE_MS } from '../constants/meeting-room.constants';
import { handleLobby, handleStarted } from '../hooks/meeting-room.socket-handlers';
import type { FakeMeetingMedia } from '../media/meeting-media.fake';
import { meetingRoomApi } from '../store/meeting-room.store';
import { cleanupController, installFakeMedia, setPhase } from './controller-kit';
import { makeBrief, makeJoined, makeSnapshot } from './fixtures';
import { flushMicrotasks } from './hook-wrapper';

/** Luồng chờ → vào phòng (app.md §8): WAITING → `meeting:started` → JOINED; IN_LOBBY → ADMITTED/DENIED; hàng chờ của chủ trì. */
jest.mock('@/core/media/permissions', () => ({
  ensureCameraPermission: jest.fn(() => Promise.resolve('granted')),
  ensureMicrophonePermission: jest.fn(() => Promise.resolve('granted')),
  openAppSettings: jest.fn(),
}));
jest.mock('@/core/device/device-id', () => ({ getDeviceId: jest.fn(() => Promise.resolve('dev-1')) }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/meeting-room.service', () => ({
  meetingRoomService: { getBrief: jest.fn(), join: jest.fn(), leave: jest.fn(), renewToken: jest.fn(), snapshot: jest.fn() },
}));

const service = jest.mocked(meetingRoomService);
let media: FakeMeetingMedia;

beforeEach(() => {
  jest.clearAllMocks();
  service.join.mockReset();
  service.leave.mockResolvedValue(undefined);
  service.getBrief.mockResolvedValue(makeBrief());
  service.snapshot.mockResolvedValue(makeSnapshot());
  service.renewToken.mockResolvedValue({ expiresAt: '2099-01-01T00:00:00.000Z', livekitUrl: 'ws://lk', token: 'fresh' });
  media = installFakeMedia();
});

afterEach(cleanupController);

describe('người CHỜ vào', () => {
  it('WAITING_FOR_HOST → meeting:started → gọi `join` lại (gộp nhịp) → JOINED → nối media → IN_ROOM', async () => {
    setPhase('WAITING_FOR_HOST');
    service.join.mockResolvedValue(makeJoined());
    handleStarted({ callId: 'call1', meetingId: 'm1', restarted: false, startedBy: 'host', version: 4 });
    await jest.advanceTimersByTimeAsync(JOIN_RETRY_DEBOUNCE_MS + 1);
    await flushMicrotasks();

    expect(service.join).toHaveBeenCalledTimes(1);
    expect(meetingRoomApi.get().phase).toBe('IN_ROOM');
    expect(media.connectCalls).toHaveLength(1);
  });

  it('meeting:started khi còn ở pre-join: chỉ làm mới chi tiết (nút chính đổi theo myActions), không tự vào', async () => {
    setPhase('PREJOIN');
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    handleStarted({ callId: 'call1', meetingId: 'm1', restarted: false, startedBy: 'host', version: 4 });
    await jest.advanceTimersByTimeAsync(JOIN_RETRY_DEBOUNCE_MS + 1);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: meetingRoomKeys.brief('m1') });
    expect(service.join).not.toHaveBeenCalled();
  });

  it('IN_LOBBY → ADMITTED (của MÌNH) → gọi `join` lại → vào phòng', async () => {
    setPhase('IN_LOBBY');
    service.join.mockResolvedValue(makeJoined());
    handleLobby({ lobbyCount: 0, meetingId: 'm1', state: 'ADMITTED', userId: 'me' }, 'me');
    await jest.advanceTimersByTimeAsync(JOIN_RETRY_DEBOUNCE_MS + 1);
    await flushMicrotasks();

    expect(meetingRoomApi.get().phase).toBe('IN_ROOM');
  });

  it('IN_LOBBY → DENIED → màn "không vào được" (DENIED), không gọi `join`', async () => {
    setPhase('IN_LOBBY');
    handleLobby({ lobbyCount: 0, meetingId: 'm1', state: 'DENIED', userId: 'me' }, 'me');
    await flushMicrotasks();

    expect(meetingRoomApi.get()).toMatchObject({ blockedCode: 'DENIED', phase: 'BLOCKED' });
    expect(service.join).not.toHaveBeenCalled();
  });

  it('ADMITTED/DENIED tới khi KHÔNG còn ở phòng chờ (tới trễ) → bỏ', async () => {
    setPhase('IN_ROOM');
    handleLobby({ lobbyCount: 0, meetingId: 'm1', state: 'DENIED', userId: 'me' }, 'me');
    await flushMicrotasks();
    expect(meetingRoomApi.get().phase).toBe('IN_ROOM');
  });
});

describe('hàng chờ của chủ trì (meeting:lobby)', () => {
  beforeEach(() => setPhase('IN_ROOM', { role: 'HOST' }));

  it('REQUESTED thêm một dòng (không trùng) + toast tên người chờ; nhiều người → "N người đang chờ"', () => {
    handleLobby({ displayName: 'Bình', lobbyCount: 1, meetingId: 'm1', state: 'REQUESTED', userId: 'u2' }, 'me');
    handleLobby({ displayName: 'Bình', lobbyCount: 1, meetingId: 'm1', state: 'REQUESTED', userId: 'u2' }, 'me');
    expect(meetingRoomApi.get().lobby).toEqual([expect.objectContaining({ displayName: 'Bình', userId: 'u2' })]);
    expect(showToast).toHaveBeenCalledWith('info', 'Bình đang chờ vào cuộc họp');

    handleLobby({ displayName: 'Cường', lobbyCount: 2, meetingId: 'm1', state: 'REQUESTED', userId: 'u3' }, 'me');
    expect(meetingRoomApi.get().lobby).toHaveLength(2);
    expect(showToast).toHaveBeenLastCalledWith('info', '2 người đang chờ vào cuộc họp');
  });

  it('CANCELLED (người xin tự huỷ, hoặc chủ trì khác đã duyệt) gỡ dòng tương ứng', () => {
    meetingRoomApi.patch({ lobby: [{ displayName: 'A', requestedAt: 'x', userId: 'u2' }, { displayName: 'B', requestedAt: 'y', userId: 'u3' }] });
    handleLobby({ lobbyCount: 1, meetingId: 'm1', reason: 'ADMITTED', state: 'CANCELLED', userId: 'u2' }, 'me');
    expect(meetingRoomApi.get().lobby.map((e) => e.userId)).toEqual(['u3']);
  });

  it('sự kiện của cuộc họp khác bị bỏ', () => {
    handleLobby({ displayName: 'X', lobbyCount: 1, meetingId: 'khac', state: 'REQUESTED', userId: 'u9' }, 'me');
    expect(meetingRoomApi.get().lobby).toEqual([]);
  });
});
