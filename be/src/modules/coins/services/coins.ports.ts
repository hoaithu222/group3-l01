import { runtimeConfig } from "../../../core/config/runtime-config";
import { LIMITS } from "../../../core/constants/limits";
import { MODULES } from "../../../core/constants/modules";
import { emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { createContextLogger } from "../../../infrastructure/logger";
import { redis } from "../../../infrastructure/redis";
import { coinsEarnSkippedTotal, coinsReconcileMismatchGauge } from "../../../infrastructure/metrics/coins.metrics";
import { AuditService } from "../../audit-log/audit-log.service";

const log = createContextLogger({ service: "CoinsPorts" });

/**
 * Cổng phụ trợ của `coins` — service không import `runtimeConfig`/socket/`AuditService`/metrics trực tiếp mà nhận qua DI (test truyền bản giả), cùng mẫu `gamification.ports.ts`.
 */

/** Trần HIỆU LỰC lúc chạy = `LIMITS.coins` ⊕ override `SystemConfig` `limits.coins` (admin chỉ HẠ được; registry đã clamp theo trần cứng). */
export interface CoinsRuntimeLimits {
  dailyEarnCap: number;
  adjustMax: number;
  balanceMax: number;
}

export interface ICoinsConfig {
  limits(): Promise<CoinsRuntimeLimits>;
  /** Phân hệ `coins` đang bật (`FEATURE_FLAGS` ⊕ `SystemConfig` ⊕ `AVAILABLE_MODULES`) — consumer bỏ qua sự kiện khi tắt. */
  enabled(): Promise<boolean>;
}

const HARD: CoinsRuntimeLimits = { dailyEarnCap: LIMITS.coins.dailyEarnCap, adjustMax: LIMITS.coins.adjustMax, balanceMax: LIMITS.coins.balanceMax };
const pick = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

export class RuntimeCoinsConfig implements ICoinsConfig {
  /** Lỗi đọc cấu hình → trần CỨNG (fail về mặc định bảo thủ, không mở rộng trần khi cấu hình hỏng). */
  async limits(): Promise<CoinsRuntimeLimits> {
    try {
      const eff = await runtimeConfig.getEffective("limits.coins");
      return { dailyEarnCap: pick(eff.dailyEarnCap, HARD.dailyEarnCap), adjustMax: pick(eff.adjustMax, HARD.adjustMax), balanceMax: HARD.balanceMax };
    } catch (err) {
      log.warn("Không đọc được limits.coins, dùng mặc định", { error: err instanceof Error ? err.message : String(err) });
      return HARD;
    }
  }

  enabled(): Promise<boolean> {
    return runtimeConfig.isFeatureEnabled(MODULES.COINS);
  }
}

export interface AuditInput {
  actorId: string;
  actorRole?: string;
  action: string;
  targetType: string;
  targetId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ICoinsAudit {
  record(input: AuditInput): Promise<void>;
}

export class ServiceCoinsAudit implements ICoinsAudit {
  private readonly audit = new AuditService();

  record(input: AuditInput): Promise<void> {
    return this.audit.record(input);
  }
}

/** Lý do đổi số dư gửi cho client (`gamification:updated.coins.reason`) — rút gọn từ loại giao dịch. */
export type CoinChangeReason = "EARN_EVENT" | "QUEST" | "SHOP" | "SALE" | "REFUND" | "ADJUST";

export interface CoinsUpdatedPayload {
  coins: { balance: number; delta: number; reason: CoinChangeReason };
}

export interface ICoinsEmitter {
  updated(userId: string, payload: CoinsUpdatedPayload): void;
}

/**
 * `gamification:updated` → `user:{id}` (mọi thiết bị) với trường `coins` (p7-02 be.md §6). ⚠️ Payload CHỈ có `coins` (không `xp/level/streak`): app phải kiểm `event.coins` trước khi vá
 * hồ sơ XP. Lỗi phát (Socket.IO chưa khởi tạo) KHÔNG làm hỏng nghiệp vụ — sự kiện chỉ để đồng bộ nhanh, client luôn đồng bộ lại bằng `GET /me/wallet`.
 */
export class SocketCoinsEmitter implements ICoinsEmitter {
  updated(userId: string, payload: CoinsUpdatedPayload): void {
    try {
      emitToUsers([userId], SocketEvent.GAMIFICATION_UPDATED, payload);
    } catch {
      // Best-effort: worker riêng phát qua cầu nối Redis; lỗi chỉ bỏ qua.
    }
  }
}

/** Kết quả một lần đối soát — CHỈ số lượng + tối đa vài id để admin tra (không số xu; log không ghi id). */
export interface ReconcileReport {
  at: string;
  checked: number;
  mismatched: number;
  /** Tối đa 20 id ví lệch (cho trang tổng quan admin). */
  sampleUserIds: string[];
}

export interface IReconcileStore {
  save(report: ReconcileReport): Promise<void>;
  last(): Promise<ReconcileReport | null>;
}

const RECONCILE_KEY = "coins:reconcile:last";
const RECONCILE_TTL_SECONDS = 3 * 24 * 3600;

/** Lưu báo cáo lần đối soát gần nhất ở Redis (3 ngày) để admin xem cảnh báo. */
export class RedisReconcileStore implements IReconcileStore {
  async save(report: ReconcileReport): Promise<void> {
    await redis.set(RECONCILE_KEY, report, RECONCILE_TTL_SECONDS);
  }

  async last(): Promise<ReconcileReport | null> {
    return (await redis.get<ReconcileReport>(RECONCILE_KEY)) ?? null;
  }
}

/** Đếm cho vận hành (nhãn ít giá trị — KHÔNG gắn userId/số xu): sự kiện bị bỏ qua theo lý do, và số ví lệch sổ cái ở lần đối soát gần nhất. */
export interface ICoinsMetrics {
  earnSkipped(reason: "CAPPED" | "NO_RULE" | "USER_INACTIVE" | "DISABLED"): void;
  reconcileMismatch(count: number): void;
}

export class PromCoinsMetrics implements ICoinsMetrics {
  earnSkipped(reason: "CAPPED" | "NO_RULE" | "USER_INACTIVE" | "DISABLED"): void {
    coinsEarnSkippedTotal.inc({ reason });
  }

  reconcileMismatch(count: number): void {
    coinsReconcileMismatchGauge.set(count);
  }
}
