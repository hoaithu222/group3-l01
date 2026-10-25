import { prisma } from "../../infrastructure/database";
import { env } from "../../core/config";
import { isPushConfigured, isVoipConfigured } from "../../infrastructure/push";
import { isModuleEnabled, MODULES } from "../../core/constants/modules";

/**
 * Trạng thái cấu hình provider push — CHỈ cờ/enum, TUYỆT ĐỐI không trả
 * project id, email service account, key id, team id hay nội dung khoá
 * (admin.md p0-06 §4 "Riêng tư": trạng thái provider không lộ secret).
 */
export interface PushProviderStatus {
  /** Cờ `push` (`FEATURE_FLAGS`) — cùng điều kiện `POST /admin/push/test` dùng để trả `PUSH_001`. */
  pushEnabled: boolean;
  fcm: { configured: boolean };
  voip: {
    configured: boolean;
    /**
     * Môi trường mặc định theo env `APNS_USE_SANDBOX`. `null` khi VoIP chưa cấu
     * hình. Lưu ý: `ApnsVoipPushSender` chọn endpoint theo `environment` ghi trên
     * TỪNG `DeviceToken` lúc đăng ký, nên đây chỉ là cấu hình mặc định.
     */
    environment: "SANDBOX" | "PRODUCTION" | null;
  };
}

export interface PushStats {
  generatedAt: string;
  push24h: {
    sent: number;
    failed: number;
    skipped: { total: number; byReason: Record<string, number> };
  };
  tokensRevoked7d: { total: number; byReason: Record<string, number> };
}

/** Bộ nhớ đệm số liệu — be.md p0-06 admin.md §2.3 "cache 60 s". */
export const PUSH_STATS_CACHE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** `skipReason`/`revokeReason` rỗng (dữ liệu cũ, trước khi có cột) gộp vào khoá này thay vì `"null"`. */
const UNKNOWN_REASON = "UNKNOWN";

function toReasonMap(rows: Array<{ reason: string | null; count: number }>): { total: number; byReason: Record<string, number> } {
  const byReason: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    const key = row.reason ?? UNKNOWN_REASON;
    byReason[key] = (byReason[key] ?? 0) + row.count;
    total += row.count;
  }
  return { total, byReason };
}

/**
 * Số liệu chỉ đọc cho tab "Thông báo" của trang system-config (p0-06 admin.md
 * §2.1/§2.3). Đọc thẳng Prisma `count`/`groupBy` (không qua repository — truy
 * vấn thống kê xuyên collection, cùng tiền lệ `AdminStorageService`).
 *
 * Cột thời gian theo trạng thái (`NotificationRecipient` không có `updatedAt`):
 * - `SENT`/`FAILED` → `deliveredPushAt` (`push.send` ghi lúc gửi xong, cả khi FAILED).
 * - `SKIPPED`      → `createdAt` (bỏ qua xảy ra ngay trong `deliver.recipient`, sau
 *   khi tạo recipient vài giây; riêng `REVOKED`/`NO_DEVICE` ở `push.send` trễ
 *   tối đa 1 cửa sổ gộp — không đáng kể so với cửa sổ 24 giờ).
 *
 * Cache trong tiến trình 60 giây (giữ cả Promise đang chạy để nhiều request
 * đồng thời chỉ tốn một lượt truy vấn — cùng tiền lệ `admin-overview`); mỗi
 * instance có cache riêng, chấp nhận vì đây là số liệu quan sát, không phải
 * nguồn sự thật nghiệp vụ.
 */
export class AdminPushStatsService {
  private cached: { at: number; promise: Promise<PushStats> } | null = null;

  constructor(
    private readonly cacheMs: number = PUSH_STATS_CACHE_MS,
    private readonly now: () => number = Date.now
  ) {}

  /** Đồng bộ, không chạm DB — chỉ đọc cờ và credential đã nạp lúc khởi động. */
  getStatus(): PushProviderStatus {
    const voipConfigured = isVoipConfigured();
    return {
      pushEnabled: isModuleEnabled(MODULES.PUSH),
      fcm: { configured: isPushConfigured() },
      voip: {
        configured: voipConfigured,
        environment: voipConfigured ? (env.APNS_USE_SANDBOX ? "SANDBOX" : "PRODUCTION") : null,
      },
    };
  }

  getStats(): Promise<PushStats> {
    const t = this.now();
    if (this.cached && t - this.cached.at < this.cacheMs) return this.cached.promise;

    const promise = this.compute(new Date(t));
    const entry = { at: t, promise };
    this.cached = entry;
    // Lỗi không được cache — request kế tiếp thử lại thay vì trả lỗi cũ suốt 60 giây.
    promise.catch(() => {
      if (this.cached === entry) this.cached = null;
    });
    return promise;
  }

  private async compute(now: Date): Promise<PushStats> {
    const since24h = new Date(now.getTime() - DAY_MS);
    const since7d = new Date(now.getTime() - 7 * DAY_MS);

    const [sent, failed, skipped, revoked] = await Promise.all([
      prisma.notificationRecipient.count({ where: { pushStatus: "SENT", deliveredPushAt: { gte: since24h } } }),
      prisma.notificationRecipient.count({ where: { pushStatus: "FAILED", deliveredPushAt: { gte: since24h } } }),
      prisma.notificationRecipient.groupBy({
        by: ["skipReason"],
        where: { pushStatus: "SKIPPED", createdAt: { gte: since24h } },
        _count: { _all: true },
      }),
      prisma.deviceToken.groupBy({
        by: ["revokeReason"],
        where: { revokedAt: { gte: since7d } },
        _count: { _all: true },
      }),
    ]);

    return {
      generatedAt: now.toISOString(),
      push24h: {
        sent,
        failed,
        skipped: toReasonMap(skipped.map((r) => ({ reason: r.skipReason, count: r._count._all }))),
      },
      tokensRevoked7d: toReasonMap(revoked.map((r) => ({ reason: r.revokeReason, count: r._count._all }))),
    };
  }
}
