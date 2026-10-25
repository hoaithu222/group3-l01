import { LIMITS } from "../../../core/constants/limits";
import type { IMediaServer } from "../../../infrastructure/media";
import { withTimeout } from "./admin-media-health.util";
import type { ActiveRoomsPort } from "./admin-media-query.service";

/**
 * Tên các phòng LiveKit đang mở cho `AdminCallDetail.roomActive` — dùng `listRooms` với trần `healthTimeoutMs` và cache trong bộ nhớ `healthCacheSeconds` (cùng nhịp health, không
 * dội LiveKit mỗi lần mở drawer). LiveKit chưa cấu hình/lỗi/quá hạn → `null` (bỏ `roomActive`, không làm hỏng chi tiết cuộc gọi).
 */
export class LiveKitRoomsProbe implements ActiveRoomsPort {
  private cached: { at: number; names: ReadonlySet<string> } | null = null;

  constructor(
    private readonly media: () => IMediaServer,
    private readonly now: () => number = Date.now
  ) {}

  async names(): Promise<ReadonlySet<string> | null> {
    const server = this.media();
    if (!server.isConfigured()) return null;
    if (this.cached && this.now() - this.cached.at < LIMITS.adminMedia.healthCacheSeconds * 1000) return this.cached.names;
    try {
      const rooms = await withTimeout(server.listRooms(), LIMITS.adminMedia.healthTimeoutMs);
      this.cached = { at: this.now(), names: new Set(rooms.map((r) => r.name)) };
      return this.cached.names;
    } catch {
      return null;
    }
  }
}
