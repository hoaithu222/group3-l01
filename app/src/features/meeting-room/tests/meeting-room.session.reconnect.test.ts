import { meetingRoomService } from '../api/meeting-room.service';
import { leaveMeeting } from '../hooks/meeting-room.leave';
import { renewTicket } from '../hooks/meeting-room.runtime-state';
import type { FakeMeetingMedia } from '../media/meeting-media.fake';
import { meetingRoomApi } from '../store/meeting-room.store';
import { cleanupController, FRESH_TOKEN, inRoom, installFakeMedia } from './controller-kit';
import { makeSnapshot } from './fixtures';
import { flushMicrotasks } from './hook-wrapper';

/**
 * Rớt hẳn → xin token mới → dựng lại phòng (app.md §3.1). Ca lỗi đã sửa: người dùng RỜI trong lúc đang chờ token (mạng chập chờn — có thể vài
 * giây) thì KHÔNG được nối lại sau đó ("kết nối ma": đã rời mà vẫn ở trong phòng LiveKit), và vé mới về muộn không được hồi sinh phiên đã dọn.
 */
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

/** Token về CHẬM — test tự quyết lúc nào trả. */
function slowToken(): (value: typeof FRESH_TOKEN) => void {
  let release: (value: typeof FRESH_TOKEN) => void = () => undefined;
  service.renewToken.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  return (value) => release(value);
}

beforeEach(() => {
  jest.clearAllMocks();
  service.leave.mockResolvedValue(undefined);
  service.renewToken.mockResolvedValue(FRESH_TOKEN);
  service.snapshot.mockResolvedValue(makeSnapshot());
  media = installFakeMedia();
});

afterEach(cleanupController);

describe('nối lại sau khi rớt hẳn', () => {
  it('bình thường: xin token mới rồi nối lại bằng token đó (không tự bật mic/camera)', async () => {
    await inRoom();
    media.emit({ reason: 'error', type: 'disconnected' });
    await flushMicrotasks();
    await flushMicrotasks();

    expect(media.connectCalls).toHaveLength(2);
    expect(media.connectCalls[1]).toMatchObject({
      audio: false,
      token: 'fresh.token',
      video: false,
    });
    expect(meetingRoomApi.get().phase).toBe('IN_ROOM');
  });

  it('rời phòng trong lúc chờ token: KHÔNG nối lại, vé về muộn không được ghi vào store đã dọn', async () => {
    await inRoom();
    const release = slowToken();
    media.emit({ reason: 'error', type: 'disconnected' });
    await flushMicrotasks();
    expect(meetingRoomApi.get().phase).toBe('RECONNECTING');

    await leaveMeeting();
    release(FRESH_TOKEN);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(media.connectCalls).toHaveLength(1);
    expect(meetingRoomApi.get()).toMatchObject({ meetingId: null, phase: 'PREJOIN', ticket: null });
  });

  it('renewTicket: phiên đổi trong lúc chờ (callId khác) ⇒ bỏ kết quả, trả false', async () => {
    await inRoom();
    const release = slowToken();
    const pending = renewTicket();
    meetingRoomApi.patch({ callId: 'call2' });
    release(FRESH_TOKEN);

    await expect(pending).resolves.toBe(false);
    expect(meetingRoomApi.get().ticket?.token).toBe('jwt.token.value');
  });
});
