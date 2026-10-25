import { logger } from "../../../infrastructure/logger";
import { redis } from "../../../infrastructure/redis";

export const SLUG_CACHE_TTL_SECONDS = 60;
/** Redis lỗi/chậm KHÔNG được làm treo `/p/:slug` — mọi thao tác cache bị chặn trần. */
const CACHE_TIMEOUT_MS = 500;

/** Kết quả tra slug được cache ở Redis 60 s — chỉ kết quả DƯƠNG (đang công khai / chuyển hướng); 404 không cache (tránh "kẹt" sau khi publish). */
export type CachedResolution =
  | { kind: "PAGE"; portfolioId: string; buildVersion: number; seoIndexable: boolean }
  | { kind: "REDIRECT"; to: string };

export interface IPortfolioCache {
  get(slugKey: string): Promise<CachedResolution | null>;
  set(slugKey: string, value: CachedResolution): Promise<void>;
  del(slugKeys: readonly string[]): Promise<void>;
}

const withTimeout = <T>(p: Promise<T>): Promise<T> =>
  Promise.race([p, new Promise<never>((_r, reject) => setTimeout(() => reject(new Error(`Redis quá ${CACHE_TIMEOUT_MS}ms`)), CACHE_TIMEOUT_MS).unref())]);

/** Redis `portfolio:slug:<slugKey>` TTL 60 s. Lỗi/quá hạn ⇒ bỏ qua cache (đọc thẳng DB) — không bao giờ làm hỏng request. */
export class RedisPortfolioCache implements IPortfolioCache {
  private key = (slugKey: string): string => `portfolio:slug:${slugKey}`;

  async get(slugKey: string): Promise<CachedResolution | null> {
    try {
      const v = await withTimeout(redis.get<CachedResolution>(this.key(slugKey)));
      return v && typeof v === "object" && (v.kind === "PAGE" || v.kind === "REDIRECT") ? v : null;
    } catch {
      return null;
    }
  }

  async set(slugKey: string, value: CachedResolution): Promise<void> {
    try {
      await withTimeout(redis.set(this.key(slugKey), value, SLUG_CACHE_TTL_SECONDS));
    } catch {
      // cache là tối ưu, không phải nguồn sự thật
    }
  }

  async del(slugKeys: readonly string[]): Promise<void> {
    await Promise.all(
      slugKeys.map((k) =>
        withTimeout(redis.del(this.key(k))).catch((err: unknown) => {
          logger.warn("[portfolio] không xoá được cache slug — hết hạn tự nhiên sau ≤ 60 s", { slugKey: k, error: err instanceof Error ? err.message : String(err) });
        })
      )
    );
  }
}
