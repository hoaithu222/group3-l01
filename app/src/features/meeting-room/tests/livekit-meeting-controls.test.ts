import type * as LiveKitSdk from 'livekit-client';

import type { LiveKitModule } from '@/core/media/livekit-loader';

import { restartCameraFacing } from '../media/livekit-meeting-controls';
import {
  VideoSubscriptions,
  VIDEO_UNSUBSCRIBE_DELAY_MS,
} from '../media/livekit-video-subscriptions';
import { fakeLkParticipant, fakePublication, FakeRoom, fakeSdk } from './livekit-sdk-fake';

/**
 * Đổi camera (lỗi đã sửa: mất 15 fps sau khi đổi; đổi lúc camera TẮT làm camera sáng ngầm) và subscribe video theo trang (bỏ subscribe TRỄ
 * để người nói đổi liên tục / vuốt qua lại không gây bão subscribe). SDK = bản giả `livekit-sdk-fake.ts`.
 */

const sdk = fakeSdk as unknown as LiveKitModule;
const asRoom = (room: FakeRoom): LiveKitSdk.Room => room as unknown as LiveKitSdk.Room;
const CAPTURE_BACK = {
  facingMode: 'environment',
  resolution: { frameRate: 15, height: 720, width: 1280 },
};

function roomWithCamera(muted: boolean | null) {
  const room = new FakeRoom({
    videoCaptureDefaults: { deviceId: { ideal: 'default' }, facingMode: 'user' },
  });
  const videoTrack = { isMuted: !!muted, restartTrack: jest.fn(() => Promise.resolve()) };
  if (muted !== null)
    room.localParticipant.trackPublications.set(
      'camera-me',
      fakePublication({ trackSid: 'camera-me', videoTrack }),
    );
  return { room, videoTrack };
}

describe('restartCameraFacing', () => {
  it('camera đang bật: khởi động lại với ĐỦ độ phân giải + 15 fps (không rơi về 30 fps mặc định của WebRTC)', async () => {
    const { room, videoTrack } = roomWithCamera(false);
    await restartCameraFacing(asRoom(room), sdk, 'back');

    expect(videoTrack.restartTrack).toHaveBeenCalledWith(CAPTURE_BACK);
    expect(room.options.videoCaptureDefaults).toMatchObject({
      deviceId: { ideal: 'default' },
      ...CAPTURE_BACK,
    });
  });

  it('camera đang TẮT: KHÔNG mở lại phần cứng camera — gỡ track đã tắt, lần bật sau theo mặt mới', async () => {
    const { room, videoTrack } = roomWithCamera(true);
    await restartCameraFacing(asRoom(room), sdk, 'back');

    expect(videoTrack.restartTrack).not.toHaveBeenCalled();
    expect(room.localParticipant.unpublishTrack).toHaveBeenCalledWith(videoTrack, true);
    expect(room.options.videoCaptureDefaults).toMatchObject(CAPTURE_BACK);
  });

  it('chưa từng bật camera: chỉ đổi mặc định của phòng', async () => {
    const { room } = roomWithCamera(null);
    await restartCameraFacing(asRoom(room), sdk, 'front');

    expect(room.localParticipant.unpublishTrack).not.toHaveBeenCalled();
    expect(room.options.videoCaptureDefaults).toMatchObject({
      facingMode: 'user',
      resolution: { frameRate: 15 },
    });
  });
});

describe('VideoSubscriptions', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function setup() {
    const room = new FakeRoom({});
    const a = fakePublication({ isDesired: false, trackSid: 'camera-a' });
    const b = fakePublication({ trackSid: 'camera-b' });
    const micB = fakePublication({ kind: 'audio', trackSid: 'mic-b' });
    room.addRemote(fakeLkParticipant('a', [a]));
    room.addRemote(fakeLkParticipant('b', [b, micB]));
    const subs = new VideoSubscriptions(() => ({ room: asRoom(room), sdk }));
    return { a, b, micB, subs };
  }

  it('chưa có danh sách: không đụng gì (track mới mặc định được nhận)', () => {
    const { a, b, subs } = setup();
    subs.apply();
    expect(a.setSubscribed).not.toHaveBeenCalled();
    expect(b.setSubscribed).not.toHaveBeenCalled();
  });

  it('cần xem → subscribe NGAY; rời danh sách → bỏ subscribe SAU hạn giữ; âm thanh không bao giờ bị đụng', () => {
    const { a, b, micB, subs } = setup();
    subs.set(['a']);
    expect(a.setSubscribed).toHaveBeenCalledWith(true);
    expect(b.setSubscribed).not.toHaveBeenCalled();

    jest.advanceTimersByTime(VIDEO_UNSUBSCRIBE_DELAY_MS);
    expect(b.setSubscribed).toHaveBeenCalledWith(false);
    expect(micB.setSubscribed).not.toHaveBeenCalled();
  });

  it('quay lại trong hạn giữ (người nói đổi/vuốt qua lại): không bỏ rồi subscribe lại', () => {
    const { b, subs } = setup();
    subs.set(['a']);
    jest.advanceTimersByTime(VIDEO_UNSUBSCRIBE_DELAY_MS / 2);
    subs.set(['a', 'b']);
    jest.advanceTimersByTime(VIDEO_UNSUBSCRIBE_DELAY_MS * 2);
    expect(b.setSubscribed).not.toHaveBeenCalled();
  });

  it('track đang chờ về (đã muốn, chưa tới): áp lại nhiều lần không gửi lệnh subscribe lặp', () => {
    const { a, subs } = setup();
    subs.set(['a']);
    a.isDesired = true; // SDK ghi nhận ý muốn ngay khi `setSubscribed(true)`
    subs.set(['a']);
    subs.apply();
    expect(a.setSubscribed).toHaveBeenCalledTimes(1);
  });

  it('dựng lại phòng khi nối lại (reset(false)): GIỮ danh sách — phòng mới vẫn chỉ nhận video đang cần', () => {
    const { b, subs } = setup();
    subs.set(['a']);
    subs.reset(false);
    subs.apply();
    jest.advanceTimersByTime(VIDEO_UNSUBSCRIBE_DELAY_MS);
    expect(b.setSubscribed).toHaveBeenCalledWith(false);
  });

  it('reset (rời phòng): huỷ lượt bỏ subscribe đang hẹn', () => {
    const { b, subs } = setup();
    subs.set(['a']);
    subs.reset();
    jest.advanceTimersByTime(VIDEO_UNSUBSCRIBE_DELAY_MS * 2);
    expect(b.setSubscribed).not.toHaveBeenCalled();
  });
});
