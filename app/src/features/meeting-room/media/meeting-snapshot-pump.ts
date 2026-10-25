import type { MeetingMediaParticipant } from './meeting-media.types';

/** Cửa sổ gộp các lần dựng lại snapshot (~6 khung hình): tối đa ~10 lần ghi store mỗi giây dù SDK bắn bao nhiêu sự kiện. */
export const SNAPSHOT_COALESCE_MS = 100;

/** Track THẬT sau mảnh mờ đục (`{ participant, publication, source }` của `livekit-meeting-snapshot.ts#refOf`) — `null` khi không có video. */
function trackOf(ref: unknown): unknown {
  return (ref as { publication?: { track?: unknown } } | null)?.publication?.track ?? null;
}

const pinTrack = (ref: unknown): unknown =>
  ref && typeof ref === 'object' ? { ...ref, track: trackOf(ref) } : ref;

/**
 * Ghim track LÚC CHỤP vào mảnh video (thêm khoá `track`). ⛔ `publication.track` là thuộc tính SỐNG: so nông hai mảnh (memo ô —
 * `components/stage/tile-equality.utils.ts#sameVideoRef`) thì subscribe lại (cùng publication, track MỚI — hay gặp khi hai sự kiện
 * bỏ/nhận được gộp chung một snapshot) vẫn ra "bằng nhau" ⇒ ô giữ track cũ, video đen. `VideoTrack` chỉ đọc `publication.track`.
 */
export const pinTracks = (participants: MeetingMediaParticipant[]): MeetingMediaParticipant[] =>
  participants.map((p) => ({
    ...p,
    screenShareRef: pinTrack(p.screenShareRef),
    videoRef: pinTrack(p.videoRef),
  }));

interface Stamp {
  key: string;
  /** Track chụp LÚC phát — `publication.track` là thuộc tính sống nên phải giữ bản chụp để biết track đã đổi (subscribe lại) hay chưa. */
  tracks: unknown[];
}

function stampOf(participants: MeetingMediaParticipant[]): Stamp {
  const tracks: unknown[] = [];
  const key = participants
    .map((p) => {
      tracks.push(trackOf(p.videoRef), trackOf(p.screenShareRef));
      return JSON.stringify([
        p.identity,
        p.isLocal,
        p.name,
        p.cameraEnabled,
        p.micEnabled,
        p.isSpeaking,
        p.connectionQuality,
        p.handRaisedAt,
        !!p.videoRef,
        !!p.screenShareRef,
      ]);
    })
    .join(',');
  return { key, tracks };
}

const sameStamp = (a: Stamp, b: Stamp): boolean =>
  a.key === b.key &&
  a.tracks.length === b.tracks.length &&
  a.tracks.every((track, i) => track === b.tracks[i]);

/**
 * Bơm snapshot người trong phòng từ adapter LiveKit ra store.
 *  · `schedule()` — GỘP: mọi lần gọi trong `SNAPSHOT_COALESCE_MS` chỉ dựng MỘT lần ở mép SAU (người nói / chất lượng mạng / attribute / bật tắt
 *    track bắn dồn dập — trước đây mỗi sự kiện là dựng lại cả danh sách + ghi store + vẽ lại cả phòng, hàng chục lần/giây).
 *  · `flush()` — dựng NGAY, huỷ lượt đang hẹn: người vào/ra, thao tác của chính mình (nút phải phản hồi tức thì), vừa kết nối.
 *  · Bản dựng ra GIỐNG HỆT bản vừa phát (cùng giá trị, cùng track) thì không phát — vd `setCameraEnabled` tự làm mới rồi SDK còn bắn
 *    `LocalTrackPublished`/`TrackUnmuted`. `flush(true)` phát bất kể (store có thể vừa bị dọn khi rời/nối lại).
 */
export class SnapshotPump {
  private last: Stamp | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly build: () => MeetingMediaParticipant[] | null,
    private readonly publish: (participants: MeetingMediaParticipant[]) => void,
  ) {}

  schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.run(false);
    }, SNAPSHOT_COALESCE_MS);
  }

  flush(force = false): void {
    this.cancel();
    this.run(force);
  }

  /** Rời phòng: huỷ lượt hẹn và quên bản đã phát (phòng sau phát lại từ đầu). */
  reset(): void {
    this.cancel();
    this.last = null;
  }

  private cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private run(force: boolean): void {
    const participants = this.build();
    if (!participants) return;
    const stamp = stampOf(participants);
    if (!force && this.last && sameStamp(stamp, this.last)) return;
    this.last = stamp;
    this.publish(participants);
  }
}
