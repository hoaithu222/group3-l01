import { loadLiveKit, startCallAudio } from '@/core/media/livekit-loader';

import { createLiveKitMeetingMedia } from '../media/livekit-meeting-media';
import type { MeetingMediaEvent } from '../media/meeting-media.types';
import { SNAPSHOT_COALESCE_MS } from '../media/meeting-snapshot-pump';
import { flushMicrotasks } from './hook-wrapper';
import {
  CONNECT,
  connectAdapter,
  fakeLkParticipant,
  fakeNative,
  fakePublication,
  FakeRoom,
  fakeSdk,
} from './livekit-sdk-fake';

/**
 * Adapter LiveKit THẬT của phòng họp trên SDK GIẢ (`livekit-sdk-fake.ts`): gộp snapshot, bỏ bản trùng, gỡ listener, giữ phiên âm thanh khi
 * nối lại, rời giữa lúc đang nối. Cấu hình `Room`/loa/phần tử video: `livekit-meeting-media.config.test.ts`. WebRTC thật CHƯA XÁC MINH.
 */
jest.mock('@/core/media/livekit-loader', () => ({
  loadLiveKit: jest.fn(),
  speakerOutputId: (on: boolean) => (on ? 'speaker' : 'earpiece'),
  startCallAudio: jest.fn(() => Promise.resolve()),
}));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  FakeRoom.instances = [];
  jest.mocked(loadLiveKit).mockResolvedValue([fakeSdk, fakeNative] as never);
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('snapshot người trong phòng', () => {
  it('vừa nối: phát NGAY một snapshot; sự kiện dồn dập (người nói/mạng/attribute) GỘP thành một lần ở mép sau, theo trạng thái MỚI nhất', async () => {
    const { room, snapshots } = await connectAdapter();
    expect(snapshots()).toHaveLength(1);

    for (let i = 0; i < 10; i += 1) room.emit('ActiveSpeakersChanged', []);
    room.localParticipant.isSpeaking = true;
    room.emit('ConnectionQualityChanged');
    room.emit('ParticipantAttributesChanged');
    expect(snapshots()).toHaveLength(1);

    jest.advanceTimersByTime(SNAPSHOT_COALESCE_MS);
    expect(snapshots()).toHaveLength(2);
    expect(snapshots()[1]?.[0]).toMatchObject({ identity: 'me', isLocal: true, isSpeaking: true });
  });

  it('không có gì đổi thì không ghi lại (bỏ bản trùng); người vào phòng phát NGAY không chờ', async () => {
    const { room, snapshots } = await connectAdapter();
    room.emit('TrackUnmuted');
    jest.advanceTimersByTime(SNAPSHOT_COALESCE_MS);
    expect(snapshots()).toHaveLength(1);

    room.addRemote(fakeLkParticipant('u2'));
    room.emit('ParticipantConnected', room.remoteParticipants.get('u2'));
    expect(snapshots()).toHaveLength(2);
    expect(snapshots()[1]?.map((p) => p.identity)).toEqual(['me', 'u2']);
  });

  it('track THẬT đổi (subscribe lại) dù mọi trường như cũ ⇒ vẫn phát bản mới (ô video phải vẽ lại track mới)', async () => {
    const { room, snapshots } = await connectAdapter();
    const camera = fakePublication({ track: { id: 'a' }, trackSid: 'camera-1' });
    room.addRemote(fakeLkParticipant('u2', [camera]));
    room.emit('ParticipantConnected');
    const before = snapshots().length;

    camera.track = { id: 'b' };
    room.emit('TrackSubscribed');
    jest.advanceTimersByTime(SNAPSHOT_COALESCE_MS);
    expect(snapshots()).toHaveLength(before + 1);
    // Mảnh video mang track LÚC CHỤP ⇒ memo ô (so nông) thấy khác và vẽ lại track mới.
    const [, u2] = snapshots().at(-1) ?? [];
    expect(u2?.videoRef).toMatchObject({ publication: camera, track: { id: 'b' } });
  });
});

describe('vòng đời phòng', () => {
  it('ngắt: gỡ HẾT listener của Room, sự kiện muộn của phòng cũ không tới tay người nghe; dừng phiên âm thanh một lần', async () => {
    const { events, media, room } = await connectAdapter();
    expect(room.listenerCount).toBeGreaterThan(0);

    await media.disconnect();
    expect(room.listenerCount).toBe(0);
    expect(room.disconnect).toHaveBeenCalledWith(true);
    expect(fakeNative.AudioSession.stopAudioSession).toHaveBeenCalledTimes(1);

    const seen = events.length;
    room.emit('Disconnected', 5);
    room.emit('ParticipantConnected');
    jest.advanceTimersByTime(SNAPSHOT_COALESCE_MS);
    expect(events).toHaveLength(seen);
  });

  it('nối lại (connect khi đang có phòng): bỏ phòng cũ nhưng KHÔNG dừng/bật lại phiên âm thanh liền nhau (đua trên Android)', async () => {
    const { media, room: first } = await connectAdapter();
    await media.connect({ ...CONNECT, token: 't2' });

    expect(first.disconnect).toHaveBeenCalledWith(true);
    expect(first.listenerCount).toBe(0);
    expect(fakeNative.AudioSession.stopAudioSession).not.toHaveBeenCalled();
    expect(FakeRoom.instances).toHaveLength(2);
  });

  it('rời khi đang chuẩn bị nối: không tạo Room, trả lại phiên âm thanh vừa bật, không báo "connected"', async () => {
    let audioReady: () => void = () => undefined;
    jest
      .mocked(startCallAudio)
      .mockImplementationOnce(() => new Promise<void>((resolve) => (audioReady = resolve)));
    const events: MeetingMediaEvent[] = [];
    const media = createLiveKitMeetingMedia();
    media.subscribe((event) => events.push(event));
    const pending = media.connect({ ...CONNECT });
    await flushMicrotasks();
    expect(startCallAudio).toHaveBeenCalledTimes(1);

    await media.disconnect();
    audioReady();
    await pending;

    expect(FakeRoom.instances).toHaveLength(0);
    expect(fakeNative.AudioSession.stopAudioSession).toHaveBeenCalledTimes(1);
    expect(events.some((event) => event.type === 'connected')).toBe(false);
  });
});
