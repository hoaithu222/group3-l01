import { LIMITS } from "../../../core/constants/limits";
import { logger } from "../../../infrastructure/logger";
import { redis } from "../../../infrastructure/redis";
import { emitToRoom } from "../../../infrastructure/socket/socket.emit";
import { ROOM } from "../../../infrastructure/socket/socket.rooms";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";

export type AdminMediaKind = "MEETING" | "CALL" | "RECORDING";

export interface AdminMediaUpdate {
  kind: AdminMediaKind;
  id: string;
  status: string;
}

export type ThrottleFn = (kind: AdminMediaKind) => Promise<boolean>;
export type EmitFn = (room: string, event: string, payload: object) => void;

/** `SET NX` 1 giây theo `kind` (p2-07 be.md §5.8) — chỉ sự kiện đầu tiên trong cửa sổ được phát; Redis lỗi/chưa sẵn sàng → bỏ sự kiện (chỉ là gợi ý invalidate, admin vẫn tải lại được). */
const redisThrottle: ThrottleFn = async (kind) => {
  try {
    return await redis.setNx(`admin-media:emit:${kind}`, "1", Math.max(1, Math.ceil(LIMITS.adminMedia.emitThrottleMs / 1000)));
  } catch {
    return false;
  }
};

/**
 * Phát `admin:media-updated { kind, id, status }` tới room `admin:media` (guard `meeting:view`) để bảng admin invalidate — KHÔNG nội dung/người dùng. Envelope `v`/`serverNow` do
 * `socket.emit` tự thêm; chạy được ở cả API lẫn worker (cầu nối Redis p0-03). Không bao giờ ném lỗi (sự kiện mất cũng không sao).
 */
export class AdminMediaUpdatedPublisher {
  constructor(
    private readonly throttle: ThrottleFn = redisThrottle,
    private readonly emit: EmitFn = emitToRoom
  ) {}

  async publish(u: AdminMediaUpdate): Promise<boolean> {
    try {
      if (!(await this.throttle(u.kind))) return false;
      this.emit(ROOM.admin("media"), SocketEvent.ADMIN_MEDIA_UPDATED, { kind: u.kind, id: u.id, status: u.status });
      return true;
    } catch (err) {
      logger.warn("[admin-media] Không phát được admin:media-updated", { kind: u.kind, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }
}
