import { showToast } from '@/shared/utils/toast.utils';

import { meetingRoomService } from '../api/meeting-room.service';
import { leaveMeeting, endMeetingForAll } from '../hooks/meeting-room.leave';
import type { FakeMeetingMedia } from '../media/meeting-media.fake';
import { meetingRoomApi } from '../store/meeting-room.store';
import { cleanupController, inRoom, installFakeMedia } from './controller-kit';
import { makeBrief, makeSnapshot } from './fixtures';
import { apiError, flushMicrotasks } from './hook-wrapper';

/** Rời và kết thúc (app.md §4.1 bước 7): thứ tự ngắt media ↔ báo server, giao quyền, kết thúc cho mọi người. */
jest.mock('@/core/media/permissions', () => ({
  ensureCameraPermission: jest.fn(() => Promise.resolve('granted')),
  ensureMicrophonePermission: jest.fn(() => Promise.resolve('granted')),
  openAppSettings: jest.fn(),
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/meeting-room.service', () => ({
  meetingRoomService: { end: jest.fn(), leave: jest.fn(), renewToken: jest.fn(), snapshot: jest.fn() },
}));

const service = jest.mocked(meetingRoomService);
let media: FakeMeetingMedia;

beforeEach(() => {
  jest.clearAllMocks();
  service.leave.mockReset().mockResolvedValue(undefined);
  service.end.mockReset();
  service.snapshot.mockResolvedValue(makeSnapshot());
  media = installFakeMedia();
});

afterEach(cleanupController);

describe('leaveMeeting', () => {
  it('rời thường: NGẮT media trước (âm thanh dừng tức thì) rồi mới báo server; store về ban đầu', async () => {
    await inRoom('MEMBER');
    const disconnect = jest.spyOn(media, 'disconnect');
    await leaveMeeting();
    await flushMicrotasks();

    expect(service.leave).toHaveBeenCalledWith('m1', undefined);
    expect(disconnect.mock.invocationCallOrder[0]).toBeLessThan(service.leave.mock.invocationCallOrder[0] ?? 0);
    expect(media.getState()).toBe('disconnected');
    expect(meetingRoomApi.get()).toMatchObject({ callId: null, meetingId: null, phase: 'PREJOIN', ticket: null });
  });

  it('rời và giao quyền: báo server (kèm người nhận) TRƯỚC khi ngắt — lời gọi phải tới khi còn trong phiên', async () => {
    await inRoom();
    const disconnect = jest.spyOn(media, 'disconnect');
    await leaveMeeting('u2');

    expect(service.leave).toHaveBeenCalledWith('m1', 'u2');
    expect(service.leave.mock.invocationCallOrder[0]).toBeLessThan(disconnect.mock.invocationCallOrder[0] ?? 0);
    expect(showToast).not.toHaveBeenCalled();
    expect(meetingRoomApi.get().meetingId).toBeNull();
  });

  it('giao quyền thất bại (mạng): vẫn rời phòng và nói rõ chưa giao được', async () => {
    await inRoom();
    service.leave.mockRejectedValue(new Error('offline'));
    const done = leaveMeeting('u2');
    await jest.advanceTimersByTimeAsync(5000);
    await done;

    expect(service.leave).toHaveBeenCalledTimes(3); // thử lại có giới hạn
    expect(showToast).toHaveBeenCalledWith('warning', expect.stringContaining('Chưa giao được quyền'));
    expect(media.getState()).toBe('disconnected');
    expect(meetingRoomApi.get().meetingId).toBeNull();
  });
});

describe('endMeetingForAll', () => {
  it('thành công: chờ server rồi sang màn "đã kết thúc" với thời lượng tính từ chi tiết, ngắt media', async () => {
    await inRoom();
    service.end.mockResolvedValue(makeBrief({ endedAt: '2026-10-01T09:45:00.000Z', startedAt: '2026-10-01T09:00:00.000Z', status: 'ENDED' }));

    await expect(endMeetingForAll()).resolves.toBe(true);
    expect(meetingRoomApi.get()).toMatchObject({ busy: false, endedDurationSec: 2700, endedReason: 'HOST_ENDED', phase: 'ENDED', ticket: null });
    expect(media.getState()).toBe('disconnected');
  });

  it('lỗi (không đủ quyền / đã kết thúc): ở lại phòng, toast tiếng Việt, không đổi pha', async () => {
    await inRoom('MEMBER');
    service.end.mockRejectedValue(apiError(403, 'MEET_002'));

    await expect(endMeetingForAll()).resolves.toBe(false);
    expect(showToast).toHaveBeenCalledWith('error', expect.stringContaining('Chỉ chủ trì'));
    expect(meetingRoomApi.get()).toMatchObject({ busy: false, phase: 'IN_ROOM' });
    expect(media.getState()).toBe('connected');
  });
});
