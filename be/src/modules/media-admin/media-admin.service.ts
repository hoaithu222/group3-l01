import { livekitRoomsActive } from "../../infrastructure/metrics";
import { getLiveKit, mediaErrors, type IMediaServer, type MediaEgress } from "../../infrastructure/media";
import type { IMediaAdminRepository } from "./media-admin.repo";

export interface MediaStatus {
  configured: boolean;
  reachable: boolean;
  latencyMs: number | null;
  rooms: { active: number; participants: number } | null;
  egress: { active: number; failed24h: number } | null;
  lastWebhookAt: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const FAILED_EGRESS = new Set(["FAILED", "ABORTED", "LIMIT_REACHED"]);

export class MediaAdminService {
  constructor(
    private readonly repo: IMediaAdminRepository,
    private readonly server: () => IMediaServer = getLiveKit
  ) {}

  /**
   * `GET /admin/media/status` (p0-08 be.md §4): chưa cấu hình → `MEDIA_001` (503); đã cấu hình nhưng không với tới máy chủ
   * → 200 `reachable: false` (trang admin cần thấy trạng thái, không phải lỗi). Egress không có (LiveKit chạy không kèm
   * egress) → `egress: null`.
   */
  async getStatus(): Promise<MediaStatus> {
    const server = this.server();
    if (!server.isConfigured()) throw mediaErrors.notConfigured();
    const lastWebhookAt = (await this.repo.lastLiveKitWebhookAt())?.toISOString() ?? null;

    const startedAt = Date.now();
    let rooms;
    try {
      rooms = await server.listRooms();
    } catch {
      return { configured: true, reachable: false, latencyMs: null, rooms: null, egress: null, lastWebhookAt };
    }
    const latencyMs = Date.now() - startedAt;
    livekitRoomsActive.set(rooms.length);

    return {
      configured: true,
      reachable: true,
      latencyMs,
      rooms: { active: rooms.length, participants: rooms.reduce((sum, r) => sum + r.numParticipants, 0) },
      egress: await this.egressSummary(server),
      lastWebhookAt,
    };
  }

  private async egressSummary(server: IMediaServer): Promise<MediaStatus["egress"]> {
    try {
      const all: MediaEgress[] = await server.listEgress();
      const since = Date.now() - DAY_MS;
      return {
        active: all.filter((e) => e.status === "STARTING" || e.status === "ACTIVE" || e.status === "ENDING").length,
        failed24h: all.filter(
          (e) => FAILED_EGRESS.has(e.status) && e.endedAt !== null && new Date(e.endedAt).getTime() >= since
        ).length,
      };
    } catch {
      return null;
    }
  }
}
