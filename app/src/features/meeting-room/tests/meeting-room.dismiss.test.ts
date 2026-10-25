import { meetingRoomHostService } from '../api/meeting-room-host.service';
import { meetingRoomService } from '../api/meeting-room.service';
import { dismissRoomScreen } from '../hooks/meeting-room.leave';
import { resetMeetingRoomStores } from '../hooks/reset-meeting-room-stores';
import type { FakeMeetingMedia } from '../media/meeting-media.fake';
import { meetingRoomApi } from '../store/meeting-room.store';
import { cleanupController, inRoom, installFakeMedia } from './controller-kit';
import { makeSnapshot } from './fixtures';

/** Rời MÀN ≠ rời họp (app.md §3.1, §5) và dọn khi đăng xuất/đổi tài khoản: phiên đang chạy không bao giờ bị bỏ lặng lẽ. */
jest.mock('@/core/media/permissions', () => ({
  ensureCameraPermission: jest.fn(() => Promise.resolve('granted')),
  ensureMicrophonePermission: jest.fn(() => Promise.resolve('granted')),
  openAppSettings: jest.fn(),
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/meeting-room.service', () => ({
  meetingRoomService: { end: jest.fn(), leave: jest.fn(), renewToken: jest.fn(), snapshot: jest.fn() },
}));
jest.mock('../api/meeting-room-host.service', () => ({ meetingRoomHostService: { cancelMyRequest: jest.fn() } }));

const service = jest.mocked(meetingRoomService);
let media: FakeMeetingMedia;

beforeEach(() => {
  jest.clearAllMocks();
  service.leave.mockResolvedValue(undefined);
  service.snapshot.mockResolvedValue(makeSnapshot());
  media = installFakeMedia();
});

afterEach(cleanupController);

describe('dismissRoomScreen — rời MÀN (không phải rời họp)', () => {
  it('đang trong phòng: KHÔNG bỏ phiên, chỉ thu nhỏ (MiniBar hiện) và đóng sheet', async () => {
    await inRoom();
    meetingRoomApi.patch({ sheet: 'PARTICIPANTS' });

    await expect(dismissRoomScreen()).resolves.toBe(true);
    expect(meetingRoomApi.get()).toMatchObject({ meetingId: 'm1', minimized: true, phase: 'IN_ROOM', sheet: 'NONE' });
    expect(media.getState()).toBe('connected');
  });

  it('đang xếp hàng lobby: huỷ yêu cầu rồi dọn sạch (chủ trì không thấy người đã bỏ đi)', async () => {
    meetingRoomApi.reset();
    meetingRoomApi.patch({ meetingId: 'm1', phase: 'IN_LOBBY' });

    await expect(dismissRoomScreen()).resolves.toBe(false);
    expect(meetingRoomHostService.cancelMyRequest).toHaveBeenCalledWith('m1');
    expect(meetingRoomApi.get().meetingId).toBeNull();
  });

  it.each(['PREJOIN', 'WAITING_FOR_HOST', 'BLOCKED', 'ENDED', 'REMOVED'] as const)('%s: dọn sạch để lần mở sau bắt đầu mới', async (phase) => {
    meetingRoomApi.reset();
    meetingRoomApi.patch({ meetingId: 'm1', phase });

    await expect(dismissRoomScreen()).resolves.toBe(false);
    expect(meetingRoomHostService.cancelMyRequest).not.toHaveBeenCalled();
    expect(meetingRoomApi.get()).toMatchObject({ meetingId: null, phase: 'PREJOIN' });
  });
});

describe('resetMeetingRoomStores — đăng xuất/đổi tài khoản', () => {
  it('ngắt media + dọn đếm giờ + đưa store về ban đầu (kể cả khi chưa có phiên)', async () => {
    await inRoom();
    meetingRoomApi.patch({ chatUnread: 4 });
    await resetMeetingRoomStores();
    expect(media.getState()).toBe('disconnected');
    expect(meetingRoomApi.get()).toMatchObject({ callId: null, chatUnread: 0, meetingId: null, phase: 'PREJOIN' });

    await expect(resetMeetingRoomStores()).resolves.toBeUndefined(); // idempotent
  });
});
