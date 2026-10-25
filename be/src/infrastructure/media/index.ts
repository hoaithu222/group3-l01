/**
 * Hạ tầng media (p0-08) — điểm vào DUY NHẤT cho phần còn lại của BE. Module nghiệp vụ (p2-01/03/05/06, p5-02)
 * import từ `@infrastructure/media`, KHÔNG import `livekit-server-sdk` trực tiếp.
 *
 *   const { token, url } = await issueMediaToken({ userId, displayName, room: roomNames.call(callId), publish: {...} });
 *   await getLiveKit().removeParticipant(room, identity);      // cổng IMediaServer (thật/noop theo env)
 *   registerLiveKitHandler({ roomKind: "call", types: ["participant_joined"], handle });   // webhook
 *   setMediaServerForTests(new InMemoryMediaServer());         // test
 */
export type {
  CreateMediaRoomInput,
  IEgressClient,
  IMediaServer,
  IRoomService,
  ListEgressInput,
  MediaEgress,
  MediaEgressFile,
  MediaEgressStatus,
  MediaEncodingPreset,
  MediaParticipant,
  MediaParticipantState,
  MediaPermission,
  MediaPing,
  MediaRoom,
  MediaS3Target,
  MediaTrackInfo,
  MediaTrackSource,
  StartRoomCompositeInput,
  UpdateMediaParticipantInput,
} from "./media.types";
export { MEDIA_TRACK_SOURCES } from "./media.types";
export { mediaErrors } from "./media.errors";
export { roomNames, type ParsedRoomName, type RoomKind } from "./room-names";
export {
  getEgressS3Config,
  getLiveKitConfig,
  isLiveKitConfigured,
  isMeetingRecordingSupported,
  type EgressS3Config,
  type LiveKitConfig,
} from "./livekit.config";
export { getLiveKit, setMediaServerForTests, LiveKitMediaServer } from "./livekit.client";
export { NoopMediaServer } from "./noop-media-server";
export { InMemoryMediaServer, type MediaCall } from "./in-memory-media-server";
export {
  issueMediaToken,
  publishSourcesOf,
  MEDIA_TOKEN_TTL_MAX_SECONDS,
  MEDIA_TOKEN_TTL_MIN_SECONDS,
  type MediaPublishPermissions,
  type MediaTokenInput,
  type MediaTokenResult,
} from "./livekit.token";
export {
  fromStoredRow,
  isKnownLiveKitEventType,
  LIVEKIT_EVENT_TYPES,
  toStoredPayload,
  verifyLiveKitWebhook,
  type LiveKitEventType,
  type NormalizedLiveKitEvent,
  type StoredLiveKitPayload,
} from "./livekit.webhook";
export {
  clearLiveKitHandlers,
  dispatchLiveKitEvent,
  registerLiveKitHandler,
  type LiveKitHandlerFn,
  type LiveKitHandlerRegistration,
  type LiveKitHandlerResult,
} from "./livekit.handlers";
export {
  checkLiveKit,
  isMediaRequired,
  resetLiveKitHealthCache,
  type LiveKitHealth,
  type LiveKitHealthReport,
} from "./livekit.health";
export {
  captureRoomsSnapshot,
  readRoomsSnapshot,
  MEDIA_ROOMS_ACTIVE_KEY,
  ROOMS_SNAPSHOT_TTL_SECONDS,
  type RoomsSnapshot,
} from "./rooms-snapshot";
