import { redis } from "../../../infrastructure/redis";
import { logger } from "../../../infrastructure/logger";
import { LIMITS } from "../../../core/constants";

/**
 * Cache-aside danh sách tài liệu theo PHIÊN BẢN workspace (`rsc:ver:{workspaceId}`, p3-01 README §2): mọi thao tác
 * ghi `bump()` → khoá cache mới không trùng khoá cũ, khỏi xoá theo pattern. Chỉ cache trang đầu (không `q`, không
 * cursor). Redis lỗi/không có → fail-open (đọc thẳng DB, không bao giờ ném ra request).
 */
export interface IResourceListCache {
  version(workspaceId: string): Promise<string>;
  bump(workspaceId: string): Promise<void>;
  read<T>(key: string): Promise<T | null>;
  write(key: string, value: unknown): Promise<void>;
}

const versionKey = (workspaceId: string) => `rsc:ver:${workspaceId}`;

export class RedisResourceListCache implements IResourceListCache {
  constructor(private readonly ttlSeconds: number = LIMITS.resource.listCacheSeconds) {}

  async version(workspaceId: string): Promise<string> {
    try {
      const v = await redis.get<string | number>(versionKey(workspaceId));
      return v === null || v === undefined ? "0" : String(v);
    } catch {
      return "0";
    }
  }

  async bump(workspaceId: string): Promise<void> {
    try {
      await redis.incr(versionKey(workspaceId));
    } catch (err) {
      logger.warn("[resources] Không tăng được phiên bản cache danh sách", {
        workspaceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async read<T>(key: string): Promise<T | null> {
    try {
      return await redis.get<T>(key);
    } catch {
      return null;
    }
  }

  async write(key: string, value: unknown): Promise<void> {
    try {
      await redis.set(key, value as object, this.ttlSeconds);
    } catch {
      // best-effort — lượt sau đọc DB
    }
  }
}

export class InMemoryResourceListCache implements IResourceListCache {
  readonly versions = new Map<string, number>();
  readonly entries = new Map<string, unknown>();
  hits = 0;

  version(workspaceId: string): Promise<string> {
    return Promise.resolve(String(this.versions.get(workspaceId) ?? 0));
  }

  bump(workspaceId: string): Promise<void> {
    this.versions.set(workspaceId, (this.versions.get(workspaceId) ?? 0) + 1);
    return Promise.resolve();
  }

  read<T>(key: string): Promise<T | null> {
    if (this.entries.has(key)) this.hits += 1;
    return Promise.resolve(this.entries.has(key) ? (this.entries.get(key) as T) : null);
  }

  write(key: string, value: unknown): Promise<void> {
    this.entries.set(key, value);
    return Promise.resolve();
  }
}
