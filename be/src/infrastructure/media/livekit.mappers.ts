import {
  EgressStatus,
  ParticipantInfo_State,
  TrackSource,
  TrackType,
  type EgressInfo,
  type ParticipantInfo,
  type ParticipantPermission,
  type Room,
  type TrackInfo,
} from "livekit-server-sdk";
import type {
  MediaEgress,
  MediaEgressStatus,
  MediaParticipant,
  MediaParticipantState,
  MediaPermission,
  MediaRoom,
  MediaTrackInfo,
  MediaTrackSource,
} from "./media.types";

/**
 * Ánh xạ kiểu SDK/protobuf (`bigint`, enum số) ⇄ kiểu cổng `IMediaServer` (JSON thuần). Chỉ `infrastructure/media`
 * import file này — phần còn lại của BE không thấy kiểu SDK.
 */

const SOURCE_TO_SDK: Record<MediaTrackSource, TrackSource> = {
  CAMERA: TrackSource.CAMERA,
  MICROPHONE: TrackSource.MICROPHONE,
  SCREEN_SHARE: TrackSource.SCREEN_SHARE,
  SCREEN_SHARE_AUDIO: TrackSource.SCREEN_SHARE_AUDIO,
};

export function toSdkSources(sources: readonly MediaTrackSource[]): TrackSource[] {
  return sources.map((s) => SOURCE_TO_SDK[s]);
}

export function fromSdkSource(source: TrackSource): MediaTrackSource | "UNKNOWN" {
  const found = (Object.entries(SOURCE_TO_SDK) as [MediaTrackSource, TrackSource][]).find(([, v]) => v === source);
  return found ? found[0] : "UNKNOWN";
}

/**
 * Mốc thời gian protobuf → ISO. LiveKit dùng đơn vị khác nhau theo trường (giây: `Room.creationTime`,
 * `ParticipantInfo.joinedAt`; nano: `EgressInfo.startedAt/endedAt`) nên suy đơn vị từ độ lớn:
 * < 1e11 giây · < 1e14 ms · < 1e17 µs · còn lại ns. `0` = chưa xảy ra → `null`.
 */
export function epochToIso(value: bigint | number | undefined): string | null {
  if (value === undefined) return null;
  const v = BigInt(value);
  if (v <= 0n) return null;
  let ms: bigint;
  if (v < 100_000_000_000n) ms = v * 1000n;
  else if (v < 100_000_000_000_000n) ms = v;
  else if (v < 100_000_000_000_000_000n) ms = v / 1000n;
  else ms = v / 1_000_000n;
  return new Date(Number(ms)).toISOString();
}

export function mapTrack(t: TrackInfo): MediaTrackInfo {
  const kind =
    t.type === TrackType.AUDIO ? "AUDIO" : t.type === TrackType.VIDEO ? "VIDEO" : t.type === TrackType.DATA ? "DATA" : "UNKNOWN";
  return { sid: t.sid, source: fromSdkSource(t.source), kind, muted: t.muted };
}

export function mapPermission(p: ParticipantPermission | undefined): MediaPermission | null {
  if (!p) return null;
  return {
    canPublish: p.canPublish,
    canSubscribe: p.canSubscribe,
    canPublishData: p.canPublishData,
    canPublishSources: p.canPublishSources.map(fromSdkSource).filter((s): s is MediaTrackSource => s !== "UNKNOWN"),
    canUpdateMetadata: p.canUpdateMetadata,
  };
}

const PARTICIPANT_STATE: Record<number, MediaParticipantState> = {
  [ParticipantInfo_State.JOINING]: "JOINING",
  [ParticipantInfo_State.JOINED]: "JOINED",
  [ParticipantInfo_State.ACTIVE]: "ACTIVE",
  [ParticipantInfo_State.DISCONNECTED]: "DISCONNECTED",
};

export function mapParticipantState(state: ParticipantInfo_State): MediaParticipantState {
  return PARTICIPANT_STATE[state] ?? "UNKNOWN";
}

export function mapParticipant(p: ParticipantInfo): MediaParticipant {
  return {
    identity: p.identity,
    sid: p.sid,
    name: p.name,
    state: mapParticipantState(p.state),
    metadata: p.metadata,
    attributes: { ...p.attributes },
    joinedAt: epochToIso(p.joinedAtMs && p.joinedAtMs > 0n ? p.joinedAtMs : p.joinedAt),
    tracks: p.tracks.map(mapTrack),
    permission: mapPermission(p.permission),
  };
}

export function mapRoom(r: Room): MediaRoom {
  return {
    name: r.name,
    sid: r.sid,
    numParticipants: r.numParticipants,
    maxParticipants: r.maxParticipants,
    emptyTimeoutSeconds: r.emptyTimeout,
    metadata: r.metadata,
    createdAt: epochToIso(r.creationTimeMs && r.creationTimeMs > 0n ? r.creationTimeMs : r.creationTime),
  };
}

const EGRESS_STATUS: Record<number, MediaEgressStatus> = {
  [EgressStatus.EGRESS_STARTING]: "STARTING",
  [EgressStatus.EGRESS_ACTIVE]: "ACTIVE",
  [EgressStatus.EGRESS_ENDING]: "ENDING",
  [EgressStatus.EGRESS_COMPLETE]: "COMPLETE",
  [EgressStatus.EGRESS_FAILED]: "FAILED",
  [EgressStatus.EGRESS_ABORTED]: "ABORTED",
  [EgressStatus.EGRESS_LIMIT_REACHED]: "LIMIT_REACHED",
};

export function mapEgressStatus(status: EgressStatus): MediaEgressStatus {
  return EGRESS_STATUS[status] ?? "UNKNOWN";
}

export function mapEgress(e: EgressInfo): MediaEgress {
  return {
    egressId: e.egressId,
    roomName: e.roomName,
    status: mapEgressStatus(e.status),
    startedAt: epochToIso(e.startedAt),
    endedAt: epochToIso(e.endedAt),
    error: e.error ? e.error : null,
    files: e.fileResults.map((f) => ({
      filename: f.filename,
      location: f.location,
      sizeBytes: Number(f.size),
      durationSeconds: Number(f.duration) / 1e9,
    })),
  };
}
