import { WebhookReceiver } from "livekit-server-sdk";
import { logger } from "../logger";
import { getLiveKitApiCredentials } from "./livekit.config";
import { epochToIso, mapEgress, mapParticipantState, mapTrack } from "./livekit.mappers";
import { mediaErrors } from "./media.errors";
import type { MediaEgress, MediaParticipantState, MediaTrackInfo } from "./media.types";

/** Sự kiện webhook LiveKit mà BE nhận xử lý (be.md §5.4); loại khác vẫn được ghi nhận và cho qua dispatcher → `IGNORED`. */
export const LIVEKIT_EVENT_TYPES = [
  "room_started",
  "room_finished",
  "participant_joined",
  "participant_left",
  "track_published",
  "track_unpublished",
  "egress_started",
  "egress_updated",
  "egress_ended",
] as const;
export type LiveKitEventType = (typeof LIVEKIT_EVENT_TYPES)[number];

export function isKnownLiveKitEventType(type: string): type is LiveKitEventType {
  return (LIVEKIT_EVENT_TYPES as readonly string[]).includes(type);
}

/**
 * Sự kiện đã chuẩn hoá — JSON thuần (ISO, không bigint) để lưu `WebhookEvent.payload`, đưa vào job và tái dựng
 * trong handler nghiệp vụ Phase 2. KHÔNG chứa `participant.name`/`metadata` (riêng tư/không cần) — handler cần
 * dữ liệu người tham gia thì gọi `IMediaServer.listParticipants` (nguồn sự thật, README §2).
 */
export interface NormalizedLiveKitEvent {
  /** `event.id` của LiveKit — khoá dedupe. */
  id: string;
  type: string;
  roomName: string | null;
  createdAt: string | null;
  room: { sid: string; numParticipants: number } | null;
  participant: { identity: string; sid: string; state: MediaParticipantState; joinedAt: string | null } | null;
  track: MediaTrackInfo | null;
  egress: MediaEgress | null;
}

/** Phần lưu ở `WebhookEvent.payload` (id/type/roomName đã có cột riêng). */
export type StoredLiveKitPayload = Omit<NormalizedLiveKitEvent, "id" | "type" | "roomName"> & { v: 1 };

export function toStoredPayload(e: NormalizedLiveKitEvent): StoredLiveKitPayload {
  return { v: 1, createdAt: e.createdAt, room: e.room, participant: e.participant, track: e.track, egress: e.egress };
}

/** Dựng lại sự kiện từ hàng `WebhookEvent` (job `livekit.event`). Payload thiếu/hỏng → các trường `null`. */
export function fromStoredRow(row: {
  eventId: string;
  type: string;
  roomName: string | null;
  payload: unknown;
}): NormalizedLiveKitEvent {
  const p = (row.payload && typeof row.payload === "object" ? row.payload : {}) as Partial<StoredLiveKitPayload>;
  return {
    id: row.eventId,
    type: row.type,
    roomName: row.roomName,
    createdAt: p.createdAt ?? null,
    room: p.room ?? null,
    participant: p.participant ?? null,
    track: p.track ?? null,
    egress: p.egress ?? null,
  };
}

/** Xác thực + chuẩn hoá webhook — chỉ hàm này (và `livekit.mappers`) đụng kiểu SDK. */
export async function verifyLiveKitWebhook(
  rawBody: Buffer | string,
  authHeader: string | undefined
): Promise<NormalizedLiveKitEvent> {
  const { apiKey, apiSecret } = getLiveKitApiCredentials();
  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

  let event;
  try {
    event = await new WebhookReceiver(apiKey, apiSecret).receive(body, token);
  } catch (err) {
    // Chỉ log LÝ DO (không log token/body — quy ước §7 mục 9).
    logger.warn("[livekit.webhook] Từ chối webhook", { reason: err instanceof Error ? err.message : String(err) });
    throw mediaErrors.invalidSignature();
  }
  if (!event.id) {
    logger.warn("[livekit.webhook] Từ chối webhook không có event.id", { type: event.event });
    throw mediaErrors.invalidSignature();
  }

  const roomName = event.room?.name || event.egressInfo?.roomName || null;
  return {
    id: event.id,
    type: event.event,
    roomName: roomName || null,
    createdAt: epochToIso(event.createdAt),
    room: event.room ? { sid: event.room.sid, numParticipants: event.room.numParticipants } : null,
    participant: event.participant
      ? {
          identity: event.participant.identity,
          sid: event.participant.sid,
          state: mapParticipantState(event.participant.state),
          joinedAt: epochToIso(
            event.participant.joinedAtMs > 0n ? event.participant.joinedAtMs : event.participant.joinedAt
          ),
        }
      : null,
    track: event.track ? mapTrack(event.track) : null,
    egress: event.egressInfo ? mapEgress(event.egressInfo) : null,
  };
}
