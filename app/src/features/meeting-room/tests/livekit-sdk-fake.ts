import { createLiveKitMeetingMedia } from '../media/livekit-meeting-media';
import type {
  MeetingConnectOptions,
  MeetingMediaEvent,
  MeetingMediaParticipant,
} from '../media/meeting-media.types';

/**
 * SDK LiveKit GIẢ (chỉ phần adapter phòng họp chạm tới) để test `media/livekit-*.ts` mà không nạp module native. KHÔNG phải test.
 * `RoomEvent.X` = chuỗi `'X'`; `FakeRoom` là bộ phát sự kiện tối giản đếm được listener (kiểm gỡ đăng ký).
 * ⚠️ File test phải tự `jest.mock('@/core/media/livekit-loader', …)` và cho `loadLiveKit` trả `[fakeSdk, fakeNative]`.
 */

type Listener = (...args: unknown[]) => void;

export interface FakePublication {
  isDesired: boolean;
  isMuted: boolean;
  kind: 'audio' | 'video';
  setSubscribed: jest.Mock;
  track?: object;
  trackSid: string;
  videoTrack?: { isMuted: boolean; restartTrack: jest.Mock };
}

export interface FakeParticipant {
  attributes: Record<string, string>;
  connectionQuality: string;
  getTrackPublication: (source: string) => FakePublication | undefined;
  identity: string;
  isCameraEnabled: boolean;
  isMicrophoneEnabled: boolean;
  isSpeaking: boolean;
  name: string;
  setCameraEnabled: jest.Mock;
  setMicrophoneEnabled: jest.Mock;
  trackPublications: Map<string, FakePublication>;
  unpublishTrack: jest.Mock;
}

export function fakePublication(
  over: Partial<FakePublication> & { trackSid: string },
): FakePublication {
  return { isDesired: true, isMuted: false, kind: 'video', setSubscribed: jest.fn(), ...over };
}

export function fakeLkParticipant(
  identity: string,
  publications: FakePublication[] = [],
): FakeParticipant {
  const trackPublications = new Map(publications.map((p) => [p.trackSid, p]));
  return {
    attributes: {},
    connectionQuality: 'good',
    getTrackPublication: (source) =>
      [...trackPublications.values()].find((p) => p.trackSid.startsWith(source)),
    identity,
    isCameraEnabled: false,
    isMicrophoneEnabled: false,
    isSpeaking: false,
    name: identity,
    setCameraEnabled: jest.fn(() => Promise.resolve()),
    setMicrophoneEnabled: jest.fn(() => Promise.resolve()),
    trackPublications,
    unpublishTrack: jest.fn(() => Promise.resolve()),
  };
}

export class FakeRoom {
  static instances: FakeRoom[] = [];
  readonly connect = jest.fn((_url: string, _token: string) => Promise.resolve());
  readonly disconnect = jest.fn((_stopTracks?: boolean) => Promise.resolve());
  readonly localParticipant = fakeLkParticipant('me');
  readonly remoteParticipants = new Map<string, FakeParticipant>();
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(
    public options: { videoCaptureDefaults?: Record<string, unknown> } & Record<string, unknown>,
  ) {
    FakeRoom.instances.push(this);
  }

  get listenerCount(): number {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }

  on(event: string, listener: Listener): this {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    this.listeners.set(event, set.add(listener));
    return this;
  }

  off(event: string, listener: Listener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }

  addRemote(participant: FakeParticipant): void {
    this.remoteParticipants.set(participant.identity, participant);
  }
}

/** `RoomEvent.X` → `'X'` (adapter chỉ dùng enum làm khoá sự kiện). */
const RoomEvent = new Proxy({}, { get: (_target, key) => String(key) });

export const fakeSdk = {
  AudioPresets: { speech: { maxBitrate: 24_000 } },
  Room: FakeRoom,
  RoomEvent,
  Track: {
    Kind: { Audio: 'audio', Video: 'video' },
    Source: { Camera: 'camera', ScreenShare: 'screen_share' },
  },
  VideoPresets: { h180: { height: 180 }, h360: { height: 360 } },
  createLocalVideoTrack: jest.fn(() => Promise.resolve({ stop: jest.fn() })),
};

export const fakeNative = {
  AudioSession: {
    selectAudioOutput: jest.fn(() => Promise.resolve()),
    stopAudioSession: jest.fn(() => Promise.resolve()),
  },
  VideoTrack: 'VideoTrack',
};

export const CONNECT: MeetingConnectOptions = {
  audio: false,
  facing: 'front',
  token: 't',
  url: 'ws://lk',
  video: false,
};

/** Adapter THẬT + bộ ghi sự kiện, nối luôn vào `FakeRoom` mới. */
export async function connectAdapter(over: Partial<MeetingConnectOptions> = {}) {
  const events: MeetingMediaEvent[] = [];
  const media = createLiveKitMeetingMedia();
  media.subscribe((event) => events.push(event));
  await media.connect({ ...CONNECT, ...over });
  const room = FakeRoom.instances.at(-1);
  if (!room) throw new Error('chưa tạo Room');
  const snapshots = (): MeetingMediaParticipant[][] =>
    events.flatMap((event) => (event.type === 'participants' ? [event.participants] : []));
  return { events, media, room, snapshots };
}
