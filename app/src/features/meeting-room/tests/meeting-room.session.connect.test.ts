import { MediaUnavailableError } from '@/core/media/call-media.types';
import { ensureCameraPermission, ensureMicrophonePermission } from '@/core/media/permissions';

import { meetingRoomService } from '../api/meeting-room.service';
import { connectToRoom } from '../hooks/meeting-room.session';
import { teardownMeetingSession } from '../hooks/meeting-room.teardown';
import type { FakeMeetingMedia } from '../media/meeting-media.fake';
import { meetingRoomApi } from '../store/meeting-room.store';
import { cleanupController, FRESH_TOKEN, installFakeMedia, startSession } from './controller-kit';
import { makeSnapshot } from './fixtures';
import { flushMicrotasks } from './hook-wrapper';

/**
 * Nối vào phòng (app.md §4.1 bước 5, §7): mic/camera KHÔNG tự bật, xin quyền chỉ khi người dùng đã chọn bật, thử lại có token mới, thiếu module
 * native thì không lặp. LiveKit thật = `FakeMeetingMedia`.
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

beforeEach(() => {
  jest.clearAllMocks();
  service.leave.mockResolvedValue(undefined);
  service.renewToken.mockResolvedValue(FRESH_TOKEN);
  service.snapshot.mockResolvedValue(makeSnapshot());
  media = installFakeMedia();
});

afterEach(cleanupController);

describe('connectToRoom', () => {
  it('mặc định mic/camera TẮT: không xin quyền, nối bằng đúng vé, vào IN_ROOM và đối soát ảnh chụp phòng', async () => {
    startSession();
    await connectToRoom();

    expect(ensureMicrophonePermission).not.toHaveBeenCalled();
    expect(ensureCameraPermission).not.toHaveBeenCalled();
    expect(media.connectCalls[0]).toEqual({ audio: false, facing: 'front', speaker: true, token: 'jwt.token.value', url: 'ws://livekit.test', video: false });
    expect(meetingRoomApi.get()).toMatchObject({ connection: 'connected', micOn: false, camOn: false, phase: 'IN_ROOM' });
    expect(service.snapshot).toHaveBeenCalledWith('m1');
  });

  it('đã bật mic ở pre-join: xin lại quyền lúc nối rồi nối với audio, camera vẫn tắt', async () => {
    startSession({ mic: true });
    await connectToRoom();

    expect(ensureMicrophonePermission).toHaveBeenCalledTimes(1);
    expect(ensureCameraPermission).not.toHaveBeenCalled();
    expect(media.connectCalls[0]).toMatchObject({ audio: true, video: false });
  });

  it('quyền bị thu hồi sau khi bật ở pre-join: vẫn vào phòng để nghe, ghi cờ micDenied', async () => {
    jest.mocked(ensureMicrophonePermission).mockResolvedValueOnce('denied');
    startSession({ mic: true });
    await connectToRoom();

    expect(media.connectCalls[0]).toMatchObject({ audio: false });
    expect(meetingRoomApi.get()).toMatchObject({ micDenied: true, phase: 'IN_ROOM' });
  });

  it('"chỉ để nghe" và token không cho publish: không xin quyền, không publish gì', async () => {
    startSession({ cam: true, listenOnly: true, mic: true });
    await connectToRoom();
    expect(ensureMicrophonePermission).not.toHaveBeenCalled();
    expect(media.connectCalls[0]).toMatchObject({ audio: false, video: false });

    await teardownMeetingSession();
    startSession({ cam: true, mic: true });
    meetingRoomApi.patch({ publish: { audio: false, screen: false, video: false } });
    await connectToRoom();
    expect(media.connectCalls[1]).toMatchObject({ audio: false, video: false });
  });

  it('lựa chọn loa đi cùng lệnh nối (đường ra ƯU TIÊN) — KHÔNG ép route bằng setSpeakerOn (sẽ đè tai nghe Bluetooth đang đeo)', async () => {
    const forced = jest.spyOn(media, 'setSpeakerOn');
    startSession();
    meetingRoomApi.patch({ speakerOn: false });
    await connectToRoom();
    expect(media.connectCalls[0]).toMatchObject({ speaker: false });

    await teardownMeetingSession();
    startSession();
    await connectToRoom();
    expect(media.connectCalls[1]).toMatchObject({ speaker: true });
    expect(forced).not.toHaveBeenCalled();
  });

  it('nối lỗi: thử tối đa 3 lần, mỗi lần sau xin TOKEN MỚI; hết lượt → về pre-join có lỗi và báo server rời', async () => {
    startSession();
    const connect = jest.spyOn(media, 'connect').mockRejectedValue(new Error('net'));
    const done = connectToRoom();
    await jest.advanceTimersByTimeAsync(10_000);
    await done;
    await flushMicrotasks();

    expect(connect).toHaveBeenCalledTimes(3);
    expect(service.renewToken).toHaveBeenCalledWith('call1');
    expect(connect.mock.calls[1]?.[0].token).toBe('fresh.token');
    expect(meetingRoomApi.get()).toMatchObject({ callId: null, phase: 'PREJOIN', ticket: null });
    expect(meetingRoomApi.get().error).toMatch(/Không kết nối được/);
    expect(service.leave).toHaveBeenCalledWith('m1', undefined);
  });

  it('thiếu module media (Expo Go) → KHÔNG thử lại, báo cần bản dev-client', async () => {
    startSession();
    const connect = jest.spyOn(media, 'connect').mockRejectedValue(new MediaUnavailableError());
    await connectToRoom();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(meetingRoomApi.get()).toMatchObject({ phase: 'PREJOIN' });
    expect(meetingRoomApi.get().error).toMatch(/dev-client/);
  });

  it('người dùng rời trong lúc đang nối: kết nối vừa mở bị ngắt ngay, không vào IN_ROOM', async () => {
    startSession();
    let release: () => void = () => undefined;
    jest.spyOn(media, 'connect').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const pending = connectToRoom();
    await flushMicrotasks();

    await teardownMeetingSession();
    const before = media.disconnectCalls;
    release();
    await pending;

    expect(media.disconnectCalls).toBeGreaterThan(before);
    expect(meetingRoomApi.get().phase).not.toBe('IN_ROOM');
  });
});
