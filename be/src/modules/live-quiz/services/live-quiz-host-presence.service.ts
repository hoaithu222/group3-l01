import { LIMITS } from "../../../core/constants/limits";
import { logger } from "../../../infrastructure/logger";
import type { LiveQuizFinishService } from "./live-quiz-finish.service";
import type { LiveQuizDeps } from "./live-quiz.types";

type HostPresence = "PRESENT" | "ABSENT" | "UNKNOWN";

/**
 * Host mất kết nối (be.md §5 "Host timeout"): socket CUỐI của host rời room → ghi `hostLastSeenMs` + hẹn lệnh `host-timeout` sau
 * `hostGraceSeconds`; host vào lại → xoá dấu + huỷ lệnh. Khi lệnh chạy, service tự kiểm lại mốc, trạng thái VÀ sự hiện diện thật của host.
 */
export class LiveQuizHostPresenceService {
  constructor(
    private readonly d: LiveQuizDeps,
    private readonly finisher: LiveQuizFinishService,
    private readonly now: () => number
  ) {}

  /**
   * Hook `disconnecting` của socket (quiz.handler): host rời room. `hostStillConnected()` kiểm các thiết bị KHÁC của host còn
   * trong room (host mở nhiều thiết bị) — còn → không làm gì.
   */
  async hostDisconnected(userId: string, sessionId: string, hostStillConnected: () => Promise<boolean>): Promise<void> {
    const meta = await this.d.store.getMeta(sessionId);
    if (!meta || meta.hostId !== userId || (meta.status !== "WAITING" && meta.status !== "IN_PROGRESS")) return;
    if (await hostStillConnected()) return;
    const lastSeenMs = this.now();
    await this.d.store.setHostLastSeen(sessionId, lastSeenMs);
    await this.d.scheduler?.schedule({ type: "host-timeout", sessionId, lastSeenMs }, LIMITS.liveQuiz.hostGraceSeconds * 1000);
  }

  /** Host (bất kỳ thiết bị nào) vào lại room `quiz:{id}` → xoá dấu rời + huỷ lệnh host-timeout đang chờ (lệnh lỡ chạy vẫn tự bỏ qua). */
  async hostReturned(userId: string, sessionId: string): Promise<void> {
    const meta = await this.d.store.getMeta(sessionId);
    if (!meta || meta.hostId !== userId || meta.hostLastSeenMs <= 0) return;
    await this.d.store.setHostLastSeen(sessionId, 0);
    await this.d.scheduler?.cancel({ type: "host-timeout", sessionId, lastSeenMs: meta.hostLastSeenMs });
  }

  /**
   * Lệnh `host-timeout`: host vẫn vắng đúng mốc `lastSeenMs` (chưa quay lại, chưa có lần rời mới hơn) → kết thúc `HOST_TIMEOUT` (đang chơi →
   * FINISHED để vẫn lưu kết quả/XP; còn chờ → CANCELLED). Idempotent: mốc lệch/phiên đã đóng → bỏ qua.
   *
   * Race: host vào lại đúng lúc `hostDisconnected` đang `fetchSockets` thì `hostReturned` thấy chưa có dấu để xoá, rồi dấu rời mới được ghi —
   * host đã về mà bị đánh dấu vắng. Vì vậy TRƯỚC khi kết thúc phải hỏi `presence` (socket thật trong room, đa instance): host có mặt → xoá
   * dấu, giữ phiên. Không kiểm được (lỗi Socket/Redis) → cũng giữ phiên (cron `expire-stale` vẫn dọn nếu host thật sự đã đi) — tốt hơn
   * kết thúc nhầm một phiên đang chơi.
   */
  async hostTimeout(sessionId: string, lastSeenMs: number): Promise<boolean> {
    const meta = await this.d.store.getMeta(sessionId);
    if (!meta || meta.hostLastSeenMs !== lastSeenMs) return false;
    if (meta.status !== "WAITING" && meta.status !== "IN_PROGRESS") return false;
    const presence = await this.presenceOf(sessionId, meta.hostId);
    if (presence === "PRESENT") await this.d.store.setHostLastSeen(sessionId, 0);
    if (presence !== "ABSENT") return false;
    const target = meta.status === "IN_PROGRESS" ? "FINISHED" : "CANCELLED";
    const r = await this.finisher.finish(sessionId, null, target, "HOST_TIMEOUT").catch(() => null);
    return r?.status === target;
  }

  /** Không có cổng `presence` (unit test/tiến trình không có Socket.IO) → coi như vắng (hành vi cũ). */
  private async presenceOf(sessionId: string, hostId: string): Promise<HostPresence> {
    if (!this.d.presence) return "ABSENT";
    try {
      return (await this.d.presence.hostConnected(sessionId, hostId)) ? "PRESENT" : "ABSENT";
    } catch (err) {
      logger.warn("[live-quiz] Không kiểm được host còn trong phòng — giữ phiên", { sessionId, error: err instanceof Error ? err.message : String(err) });
      return "UNKNOWN";
    }
  }
}
