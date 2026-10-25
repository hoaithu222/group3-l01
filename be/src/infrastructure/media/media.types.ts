/**
 * Cổng `IMediaServer` (p0-08) — máy chủ media (SFU). Module Phase 2 (p2-01 call core, p2-03 phòng thoại kênh,
 * p2-05 phòng họp, p2-06 ghi hình, p5-02 Pomodoro) CHỈ phụ thuộc file này + `getLiveKit()`; KHÔNG import
 * `livekit-server-sdk` (be.md §11 `reuse-first`). Kiểu ở đây là dữ liệu JSON thuần (chuỗi ISO, số, chuỗi
 * UPPER_SNAKE) — không có `bigint`/lớp protobuf để sang job/outbox/socket không phải chuyển đổi.
 *
 * Ba adapter cùng cổng: `LiveKitMediaServer` (thật), `NoopMediaServer` (chưa cấu hình → mọi thao tác MEDIA_001),
 * `InMemoryMediaServer` (giả cho test, không mạng).
 */

/** Nguồn track publish — UPPER_SNAKE trên dây; adapter ánh xạ sang `TrackSource` của LiveKit. */
export const MEDIA_TRACK_SOURCES = ["CAMERA", "MICROPHONE", "SCREEN_SHARE", "SCREEN_SHARE_AUDIO"] as const;
export type MediaTrackSource = (typeof MEDIA_TRACK_SOURCES)[number];

/** Quyền của 1 participant trong phòng (`updateParticipant`) — không có `roomAdmin`/`roomRecord`: chỉ BE điều khiển phòng. */
export interface MediaPermission {
  canPublish: boolean;
  canSubscribe: boolean;
  canPublishData: boolean;
  /** Chỉ các nguồn liệt kê ở đây được publish (LiveKit: ưu tiên hơn `canPublish`). */
  canPublishSources: MediaTrackSource[];
  /** Cho phép participant tự đổi metadata/attributes của mình (raise hand). Bỏ trống ⇒ `true`. */
  canUpdateMetadata?: boolean;
}

export interface MediaTrackInfo {
  sid: string;
  source: MediaTrackSource | "UNKNOWN";
  kind: "AUDIO" | "VIDEO" | "DATA" | "UNKNOWN";
  muted: boolean;
}

export type MediaParticipantState = "JOINING" | "JOINED" | "ACTIVE" | "DISCONNECTED" | "UNKNOWN";

export interface MediaParticipant {
  /** `identity = userId` (ObjectId) — lấy từ phiên server lúc cấp token, không từ client. */
  identity: string;
  sid: string;
  name: string;
  state: MediaParticipantState;
  /** JSON chuỗi `{ v:1, role, ... }` như lúc cấp token; rỗng khi không có. */
  metadata: string;
  attributes: Record<string, string>;
  joinedAt: string | null;
  tracks: MediaTrackInfo[];
  permission: MediaPermission | null;
}

export interface MediaRoom {
  name: string;
  sid: string;
  numParticipants: number;
  maxParticipants: number;
  emptyTimeoutSeconds: number;
  metadata: string;
  createdAt: string | null;
}

export interface CreateMediaRoomInput {
  name: string;
  /** Giây phòng trống tự đóng (LiveKit mặc định 300). */
  emptyTimeoutSeconds?: number;
  /** Giây sau khi người cuối rời thì đóng phòng. */
  departureTimeoutSeconds?: number;
  maxParticipants?: number;
  metadata?: string;
}

export interface UpdateMediaParticipantInput {
  /**
   * Quyền THAY THẾ NGUYÊN KHỐI (LiveKit không merge từng trường — trường thiếu thành `false`), nên bắt buộc đủ
   * `canPublish/canSubscribe/canPublishData/canPublishSources`.
   */
  permission?: MediaPermission;
  attributes?: Record<string, string>;
  metadata?: string;
  name?: string;
}

/**
 * Cổng RoomService. Quy ước lỗi (đã chuẩn hoá ở mọi adapter):
 * - không kết nối được / quá hạn → `AppError MEDIA_003` (502); chưa cấu hình → `MEDIA_001` (503);
 * - `deleteRoom`/`removeParticipant`: không tồn tại = thành công (idempotent);
 * - `listParticipants`: phòng không tồn tại → `[]`;
 * - `mutePublishedTrack`/`updateParticipant`: phòng/participant không tồn tại → `MEDIA_004` (409).
 */
export interface IRoomService {
  /** Idempotent: trùng tên trả phòng hiện có. */
  createRoom(input: CreateMediaRoomInput): Promise<MediaRoom>;
  listRooms(names?: string[]): Promise<MediaRoom[]>;
  deleteRoom(room: string): Promise<void>;
  listParticipants(room: string): Promise<MediaParticipant[]>;
  removeParticipant(room: string, identity: string): Promise<void>;
  mutePublishedTrack(room: string, identity: string, trackSid: string, muted: boolean): Promise<void>;
  updateParticipant(room: string, identity: string, input: UpdateMediaParticipantInput): Promise<void>;
}

/** Đích S3 của egress — mặc định lấy từ env `EGRESS_S3_*` (`getEgressS3Config()`); truyền tường minh chỉ để ghi đè. */
export interface MediaS3Target {
  bucket: string;
  region: string;
  accessKey: string;
  secret: string;
}

export type MediaEncodingPreset = "H264_720P_30" | "H264_720P_60" | "H264_1080P_30" | "H264_1080P_60";

export interface StartRoomCompositeInput {
  /** `filepath` là khoá đối tượng trong bucket (tự thêm `EGRESS_S3_PREFIX` nếu chưa bắt đầu bằng tiền tố đó). */
  fileOutput: { filepath: string; s3?: MediaS3Target };
  /** Bố cục LiveKit: "grid" | "speaker" | ... */
  layout?: string;
  audioOnly?: boolean;
  preset?: MediaEncodingPreset;
}

export type MediaEgressStatus =
  | "STARTING"
  | "ACTIVE"
  | "ENDING"
  | "COMPLETE"
  | "FAILED"
  | "ABORTED"
  | "LIMIT_REACHED"
  | "UNKNOWN";

export interface MediaEgressFile {
  filename: string;
  location: string;
  sizeBytes: number;
  durationSeconds: number;
}

export interface MediaEgress {
  egressId: string;
  roomName: string;
  status: MediaEgressStatus;
  startedAt: string | null;
  endedAt: string | null;
  error: string | null;
  files: MediaEgressFile[];
}

export interface ListEgressInput {
  roomName?: string;
  egressId?: string;
  active?: boolean;
}

/** Cổng Egress (mặc định RoomComposite → S3, file mp4 — README §2). */
export interface IEgressClient {
  startRoomCompositeEgress(room: string, input: StartRoomCompositeInput): Promise<MediaEgress>;
  /** Egress không tồn tại → coi như đã dừng (idempotent). */
  stopEgress(egressId: string): Promise<void>;
  listEgress(input?: ListEgressInput): Promise<MediaEgress[]>;
}

export interface MediaPing {
  latencyMs: number;
  rooms: number;
}

export interface IMediaServer extends IRoomService, IEgressClient {
  readonly kind: "livekit" | "noop" | "memory";
  /** `false` với `NoopMediaServer`. */
  isConfigured(): boolean;
  /** Gọi nhẹ `listRooms` với hạn `timeoutMs` (mặc định 2 s) — dùng cho `/api/health` và admin status. */
  ping(timeoutMs?: number): Promise<MediaPing>;
}
