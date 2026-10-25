import { createHash } from "node:crypto";
import { LIMITS } from "../../../core/constants/limits";
import { createContextLogger } from "../../../infrastructure/logger";
import { bucketOf, dayConfigFrom, type DayConfig } from "../domain/wellbeing-day";
import type { IBurnoutDirectory } from "../repositories/directory";
import type { IBurnoutSignalStore } from "../repositories/signal-store";
import type { IBurnoutConfig } from "./burnout.ports";

const log = createContextLogger({ service: "BurnoutCollector" });

const MAX_MEMO = 10_000;

export interface BurnoutCollectorDeps {
  store: IBurnoutSignalStore;
  directory: IBurnoutDirectory;
  config: IBurnoutConfig;
  dayConfig?: DayConfig;
  now?: () => Date;
}

/**
 * Thu thập tín hiệu (p7-03 be.md §5 "Collector") — CHỈ cho người ĐÃ BẬT theo dõi và khi phân hệ đang bật; người khác: không ghi gì, không tra thêm gì (GM-08). Ghi ở mức thô nhất: "khe 15 phút này có hoạt động"
 * và "khe này có thêm một sự kiện" — KHÔNG lưu loại/nội dung sự kiện, không lưu từng nhịp. Mọi lỗi hạ tầng được nuốt (có log không kèm dữ liệu): thu thập là telemetry best-effort, không được làm hỏng
 * nhịp hiện diện hay job đang xử lý sự kiện của module khác.
 */
export class BurnoutCollectorService {
  private readonly cfg: DayConfig;
  private readonly now: () => Date;
  private readonly tzCache = new Map<string, { timezone: string | null; expiresAt: number }>();
  /** Khe đã ghi gần nhất của từng người — nhịp 30 giây chỉ cần ghi khe MỘT lần (15 phút) thay vì ~30 lần. */
  private readonly lastMarked = new Map<string, string>();

  constructor(private readonly d: BurnoutCollectorDeps) {
    this.cfg = d.dayConfig ?? dayConfigFrom(LIMITS.wellbeing);
    this.now = d.now ?? (() => new Date());
  }

  /** Nhịp hiện diện `active = true` (người dùng đang tương tác): đánh dấu khe hiện tại có hoạt động. */
  async recordActive(userId: string, at: Date = this.now()): Promise<void> {
    try {
      const bucket = await this.bucketFor(userId, at);
      if (!bucket) return;
      const memo = `${bucket.date}|${bucket.slot}`;
      if (this.lastMarked.get(userId) === memo) return;
      await this.d.store.markActive(userId, bucket.date, bucket.slot);
      if (this.lastMarked.size >= MAX_MEMO) this.lastMarked.clear();
      this.lastMarked.set(userId, memo);
    } catch (err) {
      log.warn("Không ghi được tín hiệu hoạt động", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * Một sự kiện hoạt động do CHÍNH người này thực hiện (vd thao tác trên thẻ). `eventId` (jobId của sự kiện nguồn) chống đếm trùng khi job được giao lại; khoá chống trùng là bản BĂM (không giữ id thẻ/tin).
   */
  async recordEvent(userId: string, at: Date = this.now(), eventId?: string): Promise<void> {
    try {
      const bucket = await this.bucketFor(userId, at);
      if (!bucket) return;
      if (eventId !== undefined && !(await this.d.store.claimEvent(this.dedupeKey(userId, eventId)))) return;
      await this.d.store.incrEvent(userId, bucket.date, bucket.slot);
    } catch (err) {
      log.warn("Không ghi được tín hiệu sự kiện", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  /** `null` = KHÔNG thu thập (phân hệ tắt, chưa bật theo dõi, tài khoản không hoạt động, hoặc không chắc — Redis lỗi). */
  private async bucketFor(userId: string, at: Date) {
    if (!(await this.d.config.enabled())) return null;
    if (!(await this.d.store.isOptedIn(userId))) return null;
    const timezone = await this.timezoneOf(userId);
    return timezone ? bucketOf(at, timezone, this.cfg) : null;
  }

  private async timezoneOf(userId: string): Promise<string | null> {
    const nowMs = this.now().getTime();
    const cached = this.tzCache.get(userId);
    if (cached && cached.expiresAt > nowMs) return cached.timezone;
    const user = await this.d.directory.getActiveUser(userId);
    if (this.tzCache.size >= MAX_MEMO) this.tzCache.clear();
    this.tzCache.set(userId, { timezone: user?.timezone ?? null, expiresAt: nowMs + LIMITS.wellbeing.timezoneCacheSeconds * 1000 });
    return user?.timezone ?? null;
  }

  private dedupeKey(userId: string, eventId: string): string {
    return createHash("sha256").update(`${userId}:${eventId}`).digest("hex").slice(0, 32);
  }
}
