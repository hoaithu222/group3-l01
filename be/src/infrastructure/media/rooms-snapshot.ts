import { logger } from "../logger";
import { livekitRoomsActive } from "../metrics/metrics.client";
import { livekitParticipantsActive } from "../metrics/media-ops.metrics";
import { redis } from "../redis";
import type { IMediaServer } from "./media.types";

/**
 * Ảnh chụp số phòng/người đang hoạt động (README §4 Redis `media:rooms:active`, TTL ngắn): cron
 * `media.rooms-snapshot` (worker) ghi; `GET /admin/media/status` và scrape `/metrics` (API — tiến trình KHÁC worker,
 * gauge trong bộ nhớ worker không thấy được) đọc. File này cố ý KHÔNG import `livekit.client` để tránh vòng
 * `metrics → media → metrics`.
 */
export interface RoomsSnapshot {
  rooms: number;
  participants: number;
  at: string;
}

export const MEDIA_ROOMS_ACTIVE_KEY = "media:rooms:active";
/** Gấp 3 lần chu kỳ cron (30 s) để một lượt trượt không làm gauge về trống. */
export const ROOMS_SNAPSHOT_TTL_SECONDS = 90;

export async function captureRoomsSnapshot(server: IMediaServer): Promise<RoomsSnapshot> {
  const rooms = await server.listRooms();
  const snapshot: RoomsSnapshot = {
    rooms: rooms.length,
    participants: rooms.reduce((sum, r) => sum + r.numParticipants, 0),
    at: new Date().toISOString(),
  };
  livekitRoomsActive.set(snapshot.rooms);
  livekitParticipantsActive.set(snapshot.participants);
  try {
    await redis.set(MEDIA_ROOMS_ACTIVE_KEY, snapshot, ROOMS_SNAPSHOT_TTL_SECONDS);
  } catch (err) {
    logger.warn("[media.rooms-snapshot] Không ghi được Redis", { error: err instanceof Error ? err.message : String(err) });
  }
  return snapshot;
}

export async function readRoomsSnapshot(): Promise<RoomsSnapshot | null> {
  try {
    const snapshot = await redis.get<RoomsSnapshot>(MEDIA_ROOMS_ACTIVE_KEY);
    return snapshot && typeof snapshot === "object" && typeof snapshot.rooms === "number" ? snapshot : null;
  } catch {
    return null;
  }
}
