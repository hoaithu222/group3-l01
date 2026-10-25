import { LIMITS } from "../../../core/constants/limits";
import { redis } from "../../../infrastructure/redis";
import { logger } from "../../../infrastructure/logger";
import type { PushSkipReason } from "../entities/message-notification.types";

/**
 * Số liệu tổng hợp cho `GET /admin/notifications/stats` (p1-07 be.md §4) — đếm trong Redis theo 2 độ phân giải
 * (giờ cho khoảng 24h, ngày cho 7d) để đọc ≤ ~400 khoá/lần thay vì quét từng sự kiện. CHỈ là chỉ số tổng hợp,
 * KHÔNG chứa định danh người dùng (admin.md §2). Bền qua restart và đúng đa instance (khác `prom-client` trong bộ nhớ);
 * mất số liệu khi Redis lỗi là chấp nhận được (ghi best-effort, không bao giờ throw).
 */

export type StatRange = "24h" | "7d";

export const FANOUT_BUCKETS_MS = [100, 250, 500, 1000, 2000, 3000, 5000] as const;
const SUPPRESS_REASONS: PushSkipReason[] = ["muted", "dnd", "viewing", "read", "blocked"];
const PUSH_TYPES = ["message.new", "mention", "thread.reply"] as const;

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

function hourBucket(d: Date): string {
  return `h${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}`;
}

function dayBucket(d: Date): string {
  return `d${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function key(metric: string, bucket: string): string {
  return `notif:stat:${metric}:${bucket}`;
}

/** Tên chỉ số chuẩn — nơi ghi/đọc dùng chung để không lệch chính tả. */
export const STAT = {
  pushSent: "push-sent",
  pushFailed: "push-failed",
  invalidTokens: "invalid-tokens",
  inboxCreated: "inbox-created",
  suppressed: (reason: PushSkipReason) => `suppressed-${reason}`,
  byType: (type: string) => `type-${type}`,
  fanout: (bucket: string) => `fanout-${bucket}`,
} as const;

export function fanoutBucketFor(seconds: number): string {
  const ms = seconds * 1000;
  const bound = FANOUT_BUCKETS_MS.find((b) => ms <= b);
  return bound !== undefined ? `le${bound}` : "inf";
}

export async function recordStat(metric: string, n = 1, now: Date = new Date()): Promise<void> {
  const ttl = LIMITS.notification.statsRetentionDays * 86_400;
  try {
    for (const bucket of [hourBucket(now), dayBucket(now)]) {
      const k = key(metric, bucket);
      const total = await redis.incrBy(k, n);
      if (total === null) return; // Redis không khả dụng
      if (total === n) await redis.expire(k, ttl);
    }
  } catch (err) {
    logger.warn("[notification-stats] Không ghi được số liệu", {
      metric,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function bucketsFor(range: StatRange, now: Date = new Date()): string[] {
  const out: string[] = [];
  if (range === "24h") {
    for (let i = 0; i < 24; i += 1) out.push(hourBucket(new Date(now.getTime() - i * 3_600_000)));
  } else {
    for (let i = 0; i < 7; i += 1) out.push(dayBucket(new Date(now.getTime() - i * 86_400_000)));
  }
  return out;
}

async function sum(metric: string, buckets: string[]): Promise<number> {
  const values = await Promise.all(
    buckets.map(async (b) => {
      try {
        return Number((await redis.get<number>(key(metric, b))) ?? 0) || 0;
      } catch {
        return 0;
      }
    })
  );
  return values.reduce((a, b) => a + b, 0);
}

export interface NotificationStats {
  range: StatRange;
  pushSent: number;
  pushFailed: number;
  invalidTokensRemoved: number;
  suppressed: { muted: number; dnd: number; viewing: number; read: number; blocked: number };
  fanoutP95Ms: number | null;
  inboxCreated: number;
  byType: Record<string, number>;
}

/** p95 (ms) ước lượng từ histogram bucket — trả cận trên của bucket chứa phân vị 95; `null` nếu chưa có job nào. */
export function p95FromBuckets(counts: { bound: number; count: number }[]): number | null {
  const total = counts.reduce((a, c) => a + c.count, 0);
  if (total === 0) return null;
  let acc = 0;
  for (const c of counts) {
    acc += c.count;
    if (acc / total >= 0.95) return c.bound;
  }
  return counts[counts.length - 1]?.bound ?? null;
}

export async function readNotificationStats(range: StatRange, now: Date = new Date()): Promise<NotificationStats> {
  const buckets = bucketsFor(range, now);
  const [pushSent, pushFailed, invalidTokensRemoved, inboxCreated] = await Promise.all([
    sum(STAT.pushSent, buckets),
    sum(STAT.pushFailed, buckets),
    sum(STAT.invalidTokens, buckets),
    sum(STAT.inboxCreated, buckets),
  ]);
  const suppressedEntries = await Promise.all(
    SUPPRESS_REASONS.map(async (r) => [r, await sum(STAT.suppressed(r), buckets)] as const)
  );
  const byTypeEntries = await Promise.all(PUSH_TYPES.map(async (t) => [t, await sum(STAT.byType(t), buckets)] as const));
  const fanoutCounts = await Promise.all(
    [...FANOUT_BUCKETS_MS.map((b) => ({ id: `le${b}`, bound: b })), { id: "inf", bound: 10_000 }].map(async (b) => ({
      bound: b.bound,
      count: await sum(STAT.fanout(b.id), buckets),
    }))
  );

  return {
    range,
    pushSent,
    pushFailed,
    invalidTokensRemoved,
    suppressed: Object.fromEntries(suppressedEntries) as NotificationStats["suppressed"],
    fanoutP95Ms: p95FromBuckets(fanoutCounts),
    inboxCreated,
    byType: Object.fromEntries(byTypeEntries),
  };
}
