import { meetingRoomService } from '../api/meeting-room.service';
import { RECONNECT_GRACE_MS } from '../constants/meeting-room.constants';
import { connectToRoom } from '../hooks/meeting-room.session';
import type { FakeMeetingMedia } from '../media/meeting-media.fake';
import { meetingRoomApi } from '../store/meeting-room.store';
import { cleanupController, FRESH_TOKEN, installFakeMedia, startSession } from './controller-kit';
import { fakeParticipant, makeSnapshot } from './fixtures';
import { flushMicrotasks } from './hook-wrapper';

/** Sự kiện của cổng media → store (app.md §3.1, §4.3): danh sách người, cảm xúc, mất mạng có hạn 30 s, các lý do ngắt → đúng pha. */
jest.mock('@/core/media/permissions', () => ({
  ensureCameraPermission: jest.fn(() => Promise.resolve('granted')),
  ensureMicrophonePermission: jest.fn(() => Promise.resolve('granted')),
  openAppSettings: jest.fn(),
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/meeting-room.service', () => ({
  meetingRoomService: { leave: jest.fn(), renewToken: jest.fn(), snapshot: jest.fn() },
}));

const service = jest.mocked(meetingRoomService);
let media: FakeMeetingMedia;

beforeEach(async () => {
  jest.clearAllMocks();
  service.leave.mockResolvedValue(undefined);
  service.renewToken.mockResolvedValue(FRESH_TOKEN);
  service.snapshot.mockResolvedValue(makeSnapshot());
  media = installFakeMedia();
  startSession();
  await connectToRoom();
});

afterEach(cleanupController);

describe('sự kiện media → store', () => {
  it('người cục bộ trong danh sách quyết định mic/camera/giơ tay/chia sẻ (nút luôn theo track THẬT)', () => {
    media.setParticipants([
      fakeParticipant({ cameraEnabled: true, handRaisedAt: '2026-10-01T09:00:00.000Z', identity: 'me', isLocal: true, micEnabled: true, screenShareRef: {} }),
      fakeParticipant({ identity: 'u2' }),
    ]);
    expect(meetingRoomApi.get()).toMatchObject({ camOn: true, handRaisedAt: '2026-10-01T09:00:00.000Z', micOn: true, screenSharing: true });
    expect(meetingRoomApi.get().participants).toHaveLength(2);
  });

  it('cảm xúc nhận được vào hàng đợi bay', () => {
    media.emit({ at: 5, emoji: '🎉', identity: 'u2', type: 'reaction' });
    expect(meetingRoomApi.get().reactions).toEqual([expect.objectContaining({ at: 5, emoji: '🎉', identity: 'u2' })]);
  });

  it('mất mạng tạm thời → RECONNECTING; nối lại → IN_ROOM và hạ đếm giờ', async () => {
    media.emit({ type: 'reconnecting' });
    expect(meetingRoomApi.get()).toMatchObject({ connection: 'reconnecting', phase: 'RECONNECTING' });

    media.emit({ type: 'reconnected' });
    expect(meetingRoomApi.get()).toMatchObject({ connection: 'connected', phase: 'IN_ROOM' });
    await jest.advanceTimersByTimeAsync(RECONNECT_GRACE_MS + 1000);
    expect(meetingRoomApi.get().phase).toBe('IN_ROOM'); // hạn 30 s đã bị huỷ khi nối lại được
  });

  it('mất mạng quá 30 giây → về pre-join có lỗi (nút "Thử lại") và báo server rời', async () => {
    media.emit({ type: 'reconnecting' });
    await jest.advanceTimersByTimeAsync(RECONNECT_GRACE_MS);
    await flushMicrotasks();

    expect(meetingRoomApi.get()).toMatchObject({ callId: null, phase: 'PREJOIN', ticket: null });
    expect(meetingRoomApi.get().error).toMatch(/Mất kết nối quá lâu/);
    expect(service.leave).toHaveBeenCalledWith('m1', undefined);
    expect(media.getState()).toBe('disconnected');
  });

  it('cùng tài khoản vào từ máy khác (duplicate-identity) → ENDED lý do "chuyển thiết bị", không phải lỗi mạng', async () => {
    media.emit({ reason: 'duplicate-identity', type: 'disconnected' });
    await flushMicrotasks();
    expect(meetingRoomApi.get()).toMatchObject({ endedReason: 'MOVED_DEVICE', phase: 'ENDED', ticket: null });
  });

  it('bị mời ra (removed) → REMOVED', async () => {
    media.emit({ reason: 'removed', type: 'disconnected' });
    await flushMicrotasks();
    expect(meetingRoomApi.get().phase).toBe('REMOVED');
  });

  it('phòng đóng (room-closed) → ENDED chưa rõ lý do (socket tới sau sẽ bổ sung)', async () => {
    media.emit({ reason: 'room-closed', type: 'disconnected' });
    await flushMicrotasks();
    expect(meetingRoomApi.get()).toMatchObject({ endedReason: null, phase: 'ENDED' });
  });

  it('rớt hẳn (error): xin token mới và dựng lại phòng, mic/camera TẮT sau khi nối lại (không tự bật)', async () => {
    meetingRoomApi.patch({ camOn: true, micOn: true });
    media.emit({ reason: 'error', type: 'disconnected' });
    await flushMicrotasks();

    expect(service.renewToken).toHaveBeenCalledWith('call1');
    expect(media.connectCalls).toHaveLength(2);
    expect(media.connectCalls[1]).toMatchObject({ audio: false, token: 'fresh.token', url: 'ws://livekit.fresh', video: false });
    expect(meetingRoomApi.get()).toMatchObject({ camOn: false, micOn: false, phase: 'IN_ROOM' });
  });

  it('tự ngắt (reason client) không bị coi là sự cố', async () => {
    media.emit({ reason: 'client', type: 'disconnected' });
    await flushMicrotasks();
    expect(meetingRoomApi.get().phase).toBe('IN_ROOM');
  });
});
