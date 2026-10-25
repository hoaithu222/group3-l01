import { redis } from "../../../infrastructure/redis";
import { LIMITS } from "../../../core/constants";
import { runtimeConfig } from "../../../core/config/runtime-config";
import { rscErrors } from "../errors";
import type { IWorkspaceStorageRepository } from "../repositories/workspace-storage.repository";
import type { TxHandle } from "../repositories/tx";

export interface QuotaInfo {
  quotaBytes: number;
  source: "DEFAULT" | "OVERRIDE";
}

/** Đọc cấu hình runtime (mặc định ⊕ override `SystemConfig`) — `runtimeConfig` thật, test truyền bản giả. */
export interface ResourceConfigReader {
  getEffective(key: string): Promise<Record<string, unknown>>;
}

/** "Giữ chỗ" dung lượng cho asset đã xin upload nhưng chưa thành Resource — chặn nhiều upload song song vượt hạn mức. */
export interface IReservationStore {
  reserve(workspaceId: string, assetId: string, size: number): Promise<void>;
  release(workspaceId: string, assetId: string): Promise<void>;
  reservedBytes(workspaceId: string): Promise<number>;
}

const RESERVATION_TTL_SECONDS = 24 * 3600;
const reserveKey = (workspaceId: string) => `rsc:reserve:${workspaceId}`;

/**
 * Redis hash `rsc:reserve:{workspaceId}` (`assetId → "<size>:<hết hạn ms>"`). Mỗi mục tự hết hạn sau 24 h (= TTL asset
 * mồ côi của `assets.cleanup`) nên asset bị huỷ/REJECTED/dọn mà không có ai `release` cũng không giữ chỗ mãi. Redis
 * lỗi/không có → fail-open (coi như chưa giữ chỗ; kiểm CỨNG vẫn nằm ở transaction tạo Resource).
 */
export class RedisReservationStore implements IReservationStore {
  async reserve(workspaceId: string, assetId: string, size: number): Promise<void> {
    await redis.hset(reserveKey(workspaceId), assetId, `${size}:${Date.now() + RESERVATION_TTL_SECONDS * 1000}`);
    await redis.expire(reserveKey(workspaceId), RESERVATION_TTL_SECONDS);
  }

  async release(workspaceId: string, assetId: string): Promise<void> {
    await redis.hdel(reserveKey(workspaceId), assetId);
  }

  async reservedBytes(workspaceId: string): Promise<number> {
    const all = await redis.hgetall(reserveKey(workspaceId));
    const now = Date.now();
    let total = 0;
    for (const [assetId, raw] of Object.entries(all)) {
      const [rawSize, rawExpiry] = raw.split(":");
      const size = Number(rawSize);
      const expiresAt = Number(rawExpiry);
      if (!Number.isFinite(size) || !Number.isFinite(expiresAt) || expiresAt < now) {
        await redis.hdel(reserveKey(workspaceId), assetId); // dọn mục hết hạn/hỏng
        continue;
      }
      total += size;
    }
    return total;
  }
}

export class InMemoryReservationStore implements IReservationStore {
  readonly holds = new Map<string, Map<string, number>>();

  reserve(workspaceId: string, assetId: string, size: number): Promise<void> {
    const inner = this.holds.get(workspaceId) ?? new Map<string, number>();
    inner.set(assetId, size);
    this.holds.set(workspaceId, inner);
    return Promise.resolve();
  }

  release(workspaceId: string, assetId: string): Promise<void> {
    this.holds.get(workspaceId)?.delete(assetId);
    return Promise.resolve();
  }

  reservedBytes(workspaceId: string): Promise<number> {
    return Promise.resolve([...(this.holds.get(workspaceId)?.values() ?? [])].reduce((a, b) => a + b, 0));
  }
}

/**
 * Hạn mức + bộ đếm dung lượng kho tài liệu (p3-01 README §2 "Hạn mức"). Hạn mức = override riêng của workspace
 * (`SystemConfig resource.quotaOverrides`) hoặc mặc định toàn cục (`limits.resource.workspaceQuotaBytes`, 2 GiB).
 */
export class StorageQuotaService {
  constructor(
    private readonly usage: IWorkspaceStorageRepository,
    private readonly reservations: IReservationStore,
    private readonly config: ResourceConfigReader = runtimeConfig
  ) {}

  async quotaFor(workspaceId: string): Promise<QuotaInfo> {
    const [overrides, limits] = await Promise.all([
      this.config.getEffective("resource"),
      this.config.getEffective("limits.resource"),
    ]);
    const list = Array.isArray(overrides.quotaOverrides) ? (overrides.quotaOverrides as unknown[]) : [];
    const mine = list.find(
      (e): e is { workspaceId: string; bytes: number } =>
        typeof e === "object" && e !== null && (e as { workspaceId?: unknown }).workspaceId === workspaceId
    );
    if (mine && typeof mine.bytes === "number") return { quotaBytes: mine.bytes, source: "OVERRIDE" };
    const def = limits.workspaceQuotaBytes;
    return { quotaBytes: typeof def === "number" ? def : LIMITS.resource.workspaceQuotaBytes, source: "DEFAULT" };
  }

  /** Số ngày giữ thùng rác hiệu lực (mặc định 30, admin chỉnh 7–90). */
  async retentionDays(): Promise<number> {
    const limits = await this.config.getEffective("limits.resource");
    const days = limits.trashRetentionDays;
    return typeof days === "number" ? days : LIMITS.resource.trashRetentionDays;
  }

  /** Kiểm SỚM khi xin URL upload: `đã dùng + đang giữ chỗ + size > hạn mức` → `413 RSC_007` (trước khi cấp URL). */
  async assertCanReserve(workspaceId: string, size: number): Promise<void> {
    const [{ quotaBytes }, used, reserved] = await Promise.all([
      this.quotaFor(workspaceId),
      this.usage.getUsedBytes(workspaceId),
      this.safeReserved(workspaceId),
    ]);
    const usedBytes = used ?? 0;
    if (usedBytes + reserved + size > quotaBytes) throw rscErrors.quotaExceeded(quotaBytes, usedBytes);
  }

  async reserve(workspaceId: string, assetId: string, size: number): Promise<void> {
    await this.reservations.reserve(workspaceId, assetId, size);
  }

  async release(workspaceId: string, assetId: string): Promise<void> {
    await this.reservations.release(workspaceId, assetId);
  }

  /**
   * Kiểm CỨNG + cộng dung lượng trong CÙNG transaction tạo Resource: đọc `used`, so hạn mức, `$inc`. Hai transaction
   * đồng thời cùng `$inc` 1 tài liệu Workspace xung đột ghi → 1 bên thử lại (`withTransaction`) và đọc lại số mới — nên
   * `used` không bao giờ vượt hạn mức dù không có bộ lọc điều kiện (doc Workspace cũ thiếu trường không khớp toán tử).
   */
  async consumeInTx(tx: TxHandle, workspaceId: string, size: number): Promise<void> {
    const [{ quotaBytes }, used] = await Promise.all([this.quotaFor(workspaceId), this.usage.getUsedBytes(workspaceId, tx)]);
    if (used === null) throw rscErrors.assetNotAttachable();
    if (used + size > quotaBytes) throw rscErrors.quotaExceeded(quotaBytes, used);
    await this.usage.increment(tx, workspaceId, size);
  }

  /** Trả dung lượng khi xoá vĩnh viễn — trong transaction xoá Resource. */
  async refundInTx(tx: TxHandle, workspaceId: string, size: number): Promise<void> {
    await this.usage.increment(tx, workspaceId, -size);
  }

  async usedBytes(workspaceId: string): Promise<number> {
    return (await this.usage.getUsedBytes(workspaceId)) ?? 0;
  }

  private async safeReserved(workspaceId: string): Promise<number> {
    try {
      return await this.reservations.reservedBytes(workspaceId);
    } catch {
      return 0;
    }
  }
}
