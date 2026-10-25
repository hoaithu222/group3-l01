import type { Prisma } from "@prisma/client";
import { AppError, NotFoundError } from "../../../core/exceptions";
import { HttpStatusCode } from "../../../core/constants/http-status";
import { MODULES } from "../../../core/constants/modules";
import { runtimeConfig } from "../../../core/config/runtime-config";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { logger } from "../../../infrastructure/logger";
import { emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { storage } from "../../../infrastructure/storage";
import { AuditService } from "../../audit-log/audit-log.service";
import { createAssetLifecycleService, createAssetLinkService, type AssetLifecycleService, type AssetLinkService } from "../../assets/public";

/** Cổng phụ trợ của `portfolio` — service không import `runtimeConfig`/Redis/socket/storage/`AuditService` trực tiếp (nhận qua DI, test thay bản giả). */
export const PORTFOLIO_CONFIG_KEY = "portfolio";

export interface IPortfolioConfig {
  /** Công tắc khẩn cấp (`portfolio.enabled`, mặc định bật). */
  enabled(): Promise<boolean>;
  /** Trang công khai có được phục vụ không: cờ phân hệ `career` bật VÀ `portfolio.enabled` (tắt → `/p/*` 404 trung tính). */
  active(): Promise<boolean>;
  /** Portfolio MỚI mặc định noindex (`portfolio.defaultNoindex`, mặc định true). */
  defaultNoindex(): Promise<boolean>;
  bannedSlugTerms(): Promise<string[]>;
}

export class RuntimePortfolioConfig implements IPortfolioConfig {
  private async value(field: string): Promise<unknown> {
    return (await runtimeConfig.getEffective(PORTFOLIO_CONFIG_KEY))[field];
  }

  async enabled(): Promise<boolean> {
    return (await this.value("enabled")) !== false;
  }

  async active(): Promise<boolean> {
    return (await runtimeConfig.isFeatureEnabled(MODULES.CAREER)) && (await this.enabled());
  }

  async defaultNoindex(): Promise<boolean> {
    return (await this.value("defaultNoindex")) !== false;
  }

  async bannedSlugTerms(): Promise<string[]> {
    const v = await this.value("bannedSlugTerms");
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : [];
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

export interface IPortfolioAudit {
  record(input: AuditInput): Promise<void>;
}

export class ServicePortfolioAudit implements IPortfolioAudit {
  private readonly audit = new AuditService();

  record(input: AuditInput): Promise<void> {
    return this.audit.record(input);
  }
}

/** `portfolio:build-updated` → `user:{userId}` (v1) — phát SAU commit; lỗi phát không làm hỏng nghiệp vụ (client đồng bộ lại bằng `GET /me/portfolio/builds/latest`). */
export interface BuildUpdatedPayload {
  v: 1;
  portfolioId: string;
  buildId: string;
  buildVersion: number;
  status: "BUILDING" | "READY" | "FAILED";
  url?: string;
  error?: string;
}

export interface IPortfolioEmitter {
  buildUpdated(userId: string, payload: BuildUpdatedPayload): void;
}

export class SocketPortfolioEmitter implements IPortfolioEmitter {
  buildUpdated(userId: string, payload: BuildUpdatedPayload): void {
    try {
      emitToUsers([userId], SocketEvent.PORTFOLIO_BUILD_UPDATED, payload);
    } catch (err) {
      logger.warn("[portfolio] không phát được portfolio:build-updated", { userId, error: err instanceof Error ? err.message : String(err) });
    }
  }
}

/** Object build (HTML + ảnh đã resize) — KHÔNG phải `Asset` (sản phẩm dẫn xuất công khai); bucket riêng tư, chỉ BE đọc. */
export interface IPortfolioStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** `null` khi object không tồn tại. */
  read(key: string): Promise<Buffer | null>;
  /** Không nuốt lỗi — job dọn cần biết để thử lại. */
  deleteMany(keys: string[]): Promise<void>;
}

export class ObjectPortfolioStorage implements IPortfolioStorage {
  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await storage.putObject(key, body, contentType);
  }

  async read(key: string): Promise<Buffer | null> {
    const head = await storage.head(key);
    if (!head || head.size === 0) return null;
    return storage.readRange(key, 0, head.size - 1);
  }

  async deleteMany(keys: string[]): Promise<void> {
    if (keys.length > 0) await storage.deleteMany(keys);
  }
}

/** Ảnh do người dùng tải lên (asset scope AVATAR) — đọc gốc để resize; gắn/gỡ `AssetLink PORTFOLIO` cùng transaction với thay đổi hồ sơ. */
export interface IPortfolioAssets {
  /** Ném `NotFoundError`/`AppError` (ASSET_003/005/001) khi asset không dùng được. */
  assertUsableImage(userId: string, assetId: string): Promise<void>;
  /** Byte gốc của ảnh READY; `null` khi thiếu/không đọc được (ảnh bị bỏ, build không thất bại). */
  readImage(assetId: string): Promise<Buffer | null>;
  replace(tx: Prisma.TransactionClient, input: { userId: string; assetId: string; targetId: string }): Promise<void>;
  detachAll(tx: Prisma.TransactionClient, targetId: string): Promise<void>;
}

const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;

export class PublicPortfolioAssets implements IPortfolioAssets {
  constructor(
    private readonly lifecycle: AssetLifecycleService = createAssetLifecycleService(),
    private readonly links: AssetLinkService = createAssetLinkService()
  ) {}

  async assertUsableImage(userId: string, assetId: string): Promise<void> {
    const found = await this.lifecycle.getForAttach(assetId);
    if (!found) throw new NotFoundError("Không tìm thấy tệp");
    const { asset } = found;
    if (asset.ownerId !== userId) throw new AppError(ErrorMessages.ASSET_005, HttpStatusCode.FORBIDDEN, ErrorCode.ASSET_005);
    if (asset.status !== "READY") throw new AppError(ErrorMessages.ASSET_003, HttpStatusCode.CONFLICT, ErrorCode.ASSET_003);
    if (asset.kind !== "IMAGE" || asset.scope !== "AVATAR") throw new AppError(ErrorMessages.ASSET_001, HttpStatusCode.UNSUPPORTED_MEDIA_TYPE, ErrorCode.ASSET_001);
  }

  async readImage(assetId: string): Promise<Buffer | null> {
    const found = await this.lifecycle.getForAttach(assetId);
    if (found?.asset.status !== "READY" || found.asset.kind !== "IMAGE") return null;
    const head = await storage.head(found.asset.storageKey);
    if (!head || head.size === 0 || head.size > MAX_SOURCE_IMAGE_BYTES) return null;
    return storage.readRange(found.asset.storageKey, 0, head.size - 1);
  }

  replace(tx: Prisma.TransactionClient, input: { userId: string; assetId: string; targetId: string }): Promise<void> {
    return this.links.replace(tx, { targetType: "PORTFOLIO", targetId: input.targetId, assetId: input.assetId, scopeType: "NONE", actorId: input.userId });
  }

  detachAll(tx: Prisma.TransactionClient, targetId: string): Promise<void> {
    return this.links.detachAll(tx, { targetType: "PORTFOLIO", targetId });
  }
}

export * from "./portfolio-cache";
export * from "./portfolio-paths";
