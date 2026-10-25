import { LIMITS } from "../../../core/constants/limits";
import { AppError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { IMediaServer } from "../../../infrastructure/media";
import type { HealthState, MediaHealth } from "../entities/admin-media.types";
import type { IMediaOpsHealthReader } from "../repositories/media-ops-read.repository.interface";
import type { CachePort } from "./admin-media-cache";
import { TIMEOUT_MESSAGE, withTimeout } from "./admin-media-health.util";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const LIVEKIT_OK_UNDER_MS = 500; // cùng ngưỡng `checkLiveKit` (p0-08)

export type QueueCounts = { waiting: number; delayed: number; failed: number };
export interface TurnProbe {
  at: string;
  ok: boolean;
  error?: string;
}

export interface HealthDeps {
  media: () => IMediaServer;
  reader: IMediaOpsHealthReader;
  cache: CachePort;
  queueCounts: (name: "calls" | "media") => Promise<QueueCounts>;
  /** Kết quả probe TURN do job của p0-08 ghi vào Redis `media:turn-probe:last`; `null` khi chưa có. */
  turnProbe: () => Promise<TurnProbe | null>;
  now?: () => Date;
}

/** Thông điệp ĐÃ LÀM SẠCH — không URL/khoá/stack: quá hạn → "Hết thời gian chờ"; lỗi `MEDIA_*` → thông điệp cố định; còn lại chung chung. */
export function safeHealthError(err: unknown): string {
  if (err instanceof Error && err.message === TIMEOUT_MESSAGE) return TIMEOUT_MESSAGE;
  if (err instanceof AppError && err.errorCode.startsWith("MEDIA_")) return ErrorMessages[err.errorCode];
  return ErrorMessages[ErrorCode.MEDIA_003];
}

const worst = (states: HealthState[]): HealthState => (states.includes("DOWN") ? "DOWN" : states.includes("DEGRADED") ? "DEGRADED" : "OK");

/**
 * `GET /admin/media/health` (p2-07 be.md §5.5): LiveKit/Egress/webhook/TURN/hàng đợi, mỗi phần chạy SONG SONG có trần `healthTimeoutMs`, cache Redis `healthCacheSeconds`.
 * KHÔNG BAO GIỜ ném lỗi ra endpoint (OPC-07): phần lỗi thành `DOWN`/`UNKNOWN` kèm `error` đã làm sạch. Trạng thái tổng = xấu nhất trong các phần có dữ liệu (bỏ qua
 * `DISABLED`/`UNKNOWN`), nhưng `DOWN` ở một phần được báo `DEGRADED` ở mức tổng (README OPC-07: endpoint vẫn trả lời, phần lỗi nằm ở `livekit.error`).
 */
export class AdminMediaHealthService {
  private readonly now: () => Date;

  constructor(private readonly d: HealthDeps) {
    this.now = d.now ?? (() => new Date());
  }

  async check(): Promise<MediaHealth> {
    const cached = await this.d.cache.get<MediaHealth>("admin-media:health");
    if (cached) return cached;
    const [livekit, egress, webhookCore, turn, calls, media] = await Promise.all([
      this.livekit(),
      this.egress(),
      this.webhook(),
      this.turn(),
      this.queue("calls"),
      this.queue("media"),
    ]);
    const disabled = livekit.status === "DISABLED";
    const hasRooms = (livekit.rooms ?? 0) > 0;
    const webhook = this.webhookStatus(webhookCore, disabled, hasRooms);
    const queuesDegraded = !calls.error && calls.waiting > LIMITS.adminMedia.callsQueueWaitingDegraded;

    const counted = [livekit.status, egress.status, webhook.status, turn.status, ...(queuesDegraded ? (["DEGRADED"] as const) : [])].filter((s) => s !== "DISABLED" && s !== "UNKNOWN");
    const overall: HealthState = counted.length === 0 ? (livekit.status === "DISABLED" ? "DISABLED" : "UNKNOWN") : worst(counted) === "DOWN" ? "DEGRADED" : worst(counted);
    const result: MediaHealth = { status: overall, checkedAt: this.now().toISOString(), livekit, egress, webhook, turn, queues: { calls, media } };
    await this.d.cache.set("admin-media:health", result, LIMITS.adminMedia.healthCacheSeconds);
    return result;
  }

  private async livekit(): Promise<MediaHealth["livekit"]> {
    const server = this.d.media();
    if (!server.isConfigured()) return { status: "DISABLED" };
    const t0 = Date.now();
    try {
      const rooms = await withTimeout(Promise.resolve().then(() => server.listRooms()), LIMITS.adminMedia.healthTimeoutMs);
      const latencyMs = Date.now() - t0;
      return { status: latencyMs < LIVEKIT_OK_UNDER_MS ? "OK" : "DEGRADED", latencyMs, rooms: rooms.length, participants: rooms.reduce((s, r) => s + r.numParticipants, 0) };
    } catch (err) {
      return { status: "DOWN", error: safeHealthError(err) };
    }
  }

  private async egress(): Promise<MediaHealth["egress"]> {
    const server = this.d.media();
    if (!server.isConfigured()) return { status: "DISABLED" };
    const since = new Date(this.now().getTime() - DAY_MS);
    const [active, failed] = await Promise.allSettled([
      withTimeout(Promise.resolve().then(() => server.listEgress({ active: true })), LIMITS.adminMedia.healthTimeoutMs),
      withTimeout(this.d.reader.failedRecordingsSince(since), LIMITS.adminMedia.healthTimeoutMs),
    ]);
    const failed24h = failed.status === "fulfilled" ? failed.value : undefined;
    const degraded = failed24h !== undefined && failed24h > LIMITS.adminMedia.egressFailedDegradedCount;
    if (active.status === "rejected") return { status: degraded ? "DEGRADED" : "UNKNOWN", ...(failed24h !== undefined ? { failed24h } : {}), error: safeHealthError(active.reason) };
    return { status: degraded ? "DEGRADED" : "OK", active: active.value.length, ...(failed24h !== undefined ? { failed24h } : {}) };
  }

  private async webhook(): Promise<{ lastReceivedAt?: Date; received1h: number; failed1h: number; ok: boolean }> {
    const since = new Date(this.now().getTime() - HOUR_MS);
    try {
      const [last, counts] = await withTimeout(Promise.all([this.d.reader.lastLiveKitWebhookAt(), this.d.reader.liveKitWebhookCountsSince(since)]), LIMITS.adminMedia.healthTimeoutMs);
      return { ...(last ? { lastReceivedAt: last } : {}), received1h: counts.received, failed1h: counts.failed, ok: true };
    } catch {
      return { received1h: 0, failed1h: 0, ok: false };
    }
  }

  private webhookStatus(w: Awaited<ReturnType<AdminMediaHealthService["webhook"]>>, disabled: boolean, hasRooms: boolean): MediaHealth["webhook"] {
    const base = { ...(w.lastReceivedAt ? { lastReceivedAt: w.lastReceivedAt.toISOString() } : {}), received1h: w.received1h, failed1h: w.failed1h };
    if (disabled) return { status: "DISABLED", ...base };
    if (!w.ok) return { status: "UNKNOWN", ...base };
    const silentMs = LIMITS.adminMedia.webhookSilentMinutes * 60_000;
    const silent = hasRooms && (!w.lastReceivedAt || this.now().getTime() - w.lastReceivedAt.getTime() > silentMs);
    return { status: silent || w.failed1h > 0 ? "DEGRADED" : "OK", ...base };
  }

  private async turn(): Promise<MediaHealth["turn"]> {
    if (!this.d.media().isConfigured()) return { status: "DISABLED" };
    try {
      const probe = await withTimeout(this.d.turnProbe(), LIMITS.adminMedia.healthTimeoutMs);
      if (!probe) return { status: "UNKNOWN" };
      const stale = this.now().getTime() - new Date(probe.at).getTime() > LIMITS.adminMedia.turnProbeStaleMinutes * 60_000;
      return { status: !probe.ok || stale ? "DEGRADED" : "OK", lastProbeAt: probe.at, lastProbeOk: probe.ok, ...(!probe.ok ? { error: "Probe TURN thất bại" } : {}) };
    } catch (err) {
      return { status: "UNKNOWN", error: safeHealthError(err) };
    }
  }

  private async queue(name: "calls" | "media"): Promise<MediaHealth["queues"]["calls"]> {
    try {
      const c = await withTimeout(this.d.queueCounts(name), LIMITS.adminMedia.healthTimeoutMs);
      return { waiting: c.waiting, delayed: c.delayed, failed: c.failed };
    } catch (err) {
      return { waiting: 0, delayed: 0, failed: 0, error: safeHealthError(err) };
    }
  }
}
