import type { ReactElement } from 'react';

import { loadLiveKit, startCallAudio } from '@/core/media/livekit-loader';

import { connectAdapter, fakeNative, FakeRoom, fakeSdk } from './livekit-sdk-fake';

/**
 * Cấu hình adapter LiveKit của phòng họp (app.md §6) trên SDK GIẢ: tuỳ chọn `Room` (adaptiveStream/dynacast/simulcast/âm thanh speech), đường
 * ra âm thanh ưu tiên (không ép loa đè tai nghe Bluetooth), phần tử `VideoTrack` (phủ khung, zOrder cho ô nổi). Đã đối chiếu mã nguồn
 * `livekit-client@2.22.3` — hành vi trên máy thật CHƯA XÁC MINH.
 */
jest.mock('@/core/media/livekit-loader', () => ({
  loadLiveKit: jest.fn(),
  speakerOutputId: (on: boolean) => (on ? 'speaker' : 'earpiece'),
  startCallAudio: jest.fn(() => Promise.resolve()),
}));

beforeEach(() => {
  jest.clearAllMocks();
  FakeRoom.instances = [];
  jest.mocked(loadLiveKit).mockResolvedValue([fakeSdk, fakeNative] as never);
});

describe('cấu hình adapter LiveKit phòng họp', () => {
  it('loa: truyền đường ra ƯU TIÊN cho phiên âm thanh, không ép route sau khi nối', async () => {
    await connectAdapter({ speaker: false });
    expect(startCallAudio).toHaveBeenLastCalledWith(fakeNative, 'earpiece');
    await connectAdapter();
    expect(startCallAudio).toHaveBeenLastCalledWith(fakeNative, 'speaker');
    expect(fakeNative.AudioSession.selectAudioOutput).not.toHaveBeenCalled();
  });

  it('Room: adaptiveStream + dynacast, âm thanh speech + DTX + RED, camera 720p15 simulcast h180/h360', async () => {
    const { room } = await connectAdapter({ facing: 'back' });
    expect(room.options).toMatchObject({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        audioPreset: fakeSdk.AudioPresets.speech,
        dtx: true,
        red: true,
        simulcast: true,
        videoCodec: 'vp8',
        videoEncoding: { maxFramerate: 15 },
        videoSimulcastLayers: [fakeSdk.VideoPresets.h180, fakeSdk.VideoPresets.h360],
      },
      videoCaptureDefaults: {
        facingMode: 'environment',
        resolution: { frameRate: 15, height: 720, width: 1280 },
      },
    });
  });

  it('renderVideo: phủ tuyệt đối khung cha, mặc định cover, chuyển zOrder/mirror xuống VideoTrack; không có mảnh ⇒ null', async () => {
    const { media } = await connectAdapter();
    const element = media.renderVideo({ ref: 1 }, { mirror: true, zOrder: 1 }) as ReactElement<
      Record<string, unknown>
    >;

    expect(element.type).toBe('VideoTrack');
    expect(element.props).toMatchObject({
      mirror: true,
      objectFit: 'cover',
      style: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
      zOrder: 1,
    });
    expect(media.renderVideo(null)).toBeNull();
  });
});
