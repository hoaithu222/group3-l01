import { AccessToken } from "livekit-server-sdk";
import { runtimeConfig } from "../../core/config/runtime-config";
import { AppError } from "../../core/exceptions";
import { LIMITS } from "../../core/constants/limits";
import { ErrorCode } from "../../core/utils/error.codes";
import { getLiveKitConfig } from "./livekit.config";
import { toSdkSources } from "./livekit.mappers";
import type { MediaTrackSource } from "./media.types";
import { roomNames } from "./room-names";

/** Trần/sàn TTL token — khớp khoảng của registry `limits.call.tokenTtlSeconds` (300–3600) nhưng cho phép TTL ngắn hơn cho test. */
export const MEDIA_TOKEN_TTL_MIN_SECONDS = 30;
export const MEDIA_TOKEN_TTL_MAX_SECONDS = 3600;

export interface MediaPublishPermissions {
  audio: boolean;
  video: boolean;
  screen: boolean;
  /** Data channel (raise hand, ...). Mặc định `true`. */
  data?: boolean;
}

export interface MediaTokenInput {
  /** Định danh người dùng (ObjectId) — LẤY TỪ PHIÊN SERVER sau khi kiểm quyền, KHÔNG nhận từ client. */
  userId: string;
  displayName: string;
  /** Tên phòng dựng bằng `roomNames.*` (`call_`/`meet_`/`spike_`). */
  room: string;
  publish: MediaPublishPermissions;
  /** Mặc định `true`. */
  subscribe?: boolean;
  /** Ghép vào metadata `{ v: 1, role, callId|meetingId, ... }`; `v` luôn là 1. */
  metadata?: Record<string, string | number | boolean>;
  /** Mặc định `limits.call.tokenTtlSeconds` (runtime, README §2: 600 s). */
  ttlSeconds?: number;
}

export interface MediaTokenResult {
  token: string;
  /** `LIVEKIT_PUBLIC_URL` — URL client kết nối. */
  url: string;
  room: string;
  identity: string;
  expiresAt: string;
}

/** Nguồn được publish theo `publish` — CHỈ chỗ này quyết định `canPublishSources` (p2-03/p2-05 dùng lại cho `updateParticipant`). */
export function publishSourcesOf(publish: MediaPublishPermissions): MediaTrackSource[] {
  const sources: MediaTrackSource[] = [];
  if (publish.audio) sources.push("MICROPHONE");
  if (publish.video) sources.push("CAMERA");
  if (publish.screen) sources.push("SCREEN_SHARE", "SCREEN_SHARE_AUDIO");
  return sources;
}

async function resolveTtlSeconds(requested: number | undefined): Promise<number> {
  let ttl = requested;
  if (ttl === undefined) {
    const effective = await runtimeConfig.getEffective("limits.call");
    ttl = typeof effective.tokenTtlSeconds === "number" ? effective.tokenTtlSeconds : LIMITS.call.tokenTtlSeconds;
  }
  return Math.min(Math.max(Math.floor(ttl), MEDIA_TOKEN_TTL_MIN_SECONDS), MEDIA_TOKEN_TTL_MAX_SECONDS);
}

function invalidInput(message: string): AppError {
  return new AppError(`issueMediaToken: ${message}`, 500, ErrorCode.SYS_500);
}

/**
 * Cấp token kết nối LiveKit (p0-08 be.md §5.1). Token chỉ để KẾT NỐI (TTL ngắn, thu hồi quyền nhanh); gia hạn bằng
 * endpoint nghiệp vụ Phase 2. Grant client CHỈ gồm `roomJoin/room/canPublish/canSubscribe/canPublishData/
 * canPublishSources/canUpdateOwnMetadata` — KHÔNG BAO GIỜ `roomAdmin/roomCreate/roomRecord` (host control đi
 * qua REST của BE → `IMediaServer`). Không nhận `identity`/`room` trực tiếp từ client: caller truyền sau `PermissionService`.
 */
export async function issueMediaToken(input: MediaTokenInput): Promise<MediaTokenResult> {
  if (!input.userId) throw invalidInput("thiếu userId");
  if (!input.room) throw invalidInput("thiếu room");
  if (roomNames.parse(input.room).kind === "unknown") throw invalidInput("tên phòng không thuộc call_/meet_/spike_");

  const config = getLiveKitConfig();
  const ttlSeconds = await resolveTtlSeconds(input.ttlSeconds);
  const sources = publishSourcesOf(input.publish);

  const at = new AccessToken(config.apiKey, config.apiSecret, {
    identity: input.userId,
    name: input.displayName || input.userId,
    ttl: ttlSeconds,
    metadata: JSON.stringify({ ...input.metadata, v: 1 }),
  });
  at.addGrant({
    roomJoin: true,
    room: input.room,
    canSubscribe: input.subscribe ?? true,
    canPublish: sources.length > 0,
    canPublishSources: toSdkSources(sources),
    canPublishData: input.publish.data ?? true,
    canUpdateOwnMetadata: true,
  });

  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  return {
    token: await at.toJwt(),
    url: config.publicUrl,
    room: input.room,
    identity: input.userId,
    expiresAt,
  };
}
