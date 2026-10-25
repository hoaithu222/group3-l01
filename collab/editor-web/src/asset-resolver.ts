import type { AssetUrlError } from "./bridge-protocol";

const DEFAULT_TTL_MS = 45_000;
/** Bỏ URL khỏi cache sớm hơn hạn thật để không trao URL sắp hết hạn cho `<img>`. */
const SAFETY_MS = 5_000;

export type AssetFailureReason = AssetUrlError | "timeout";

export class AssetUrlFailure extends Error {
  constructor(readonly reason: AssetFailureReason) {
    super(`asset url: ${reason}`);
  }
}

interface Pending {
  promise: Promise<string>;
  settle: (result: { url: string } | { error: AssetFailureReason }) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface AssetResolverDeps {
  /** Gửi `resolveAssetUrl { assetId }` cho app. */
  request(assetId: string): void;
  now?: () => number;
  timeoutMs?: number;
}

/**
 * URL ký của ảnh (≤ 60 s, KHÔNG lưu trong CRDT): xin app qua bridge, gộp các yêu cầu đang chờ cùng `assetId`, đệm trong bộ nhớ tới lúc
 * gần hết hạn (`expiresAt` do app gửi, mặc định 45 s). `invalidate` khi ảnh lỗi tải (URL hết hạn) để xin lại.
 */
export class AssetUrlResolver {
  private readonly cache = new Map<string, { url: string; validUntil: number }>();
  private readonly pending = new Map<string, Pending>();
  private readonly now: () => number;
  private readonly timeoutMs: number;

  constructor(private readonly deps: AssetResolverDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.timeoutMs = deps.timeoutMs ?? 15_000;
  }

  resolve(assetId: string): Promise<string> {
    const cached = this.cache.get(assetId);
    if (cached && cached.validUntil > this.now()) return Promise.resolve(cached.url);
    const inflight = this.pending.get(assetId);
    if (inflight) return inflight.promise;

    const entry = {} as Pending;
    entry.promise = new Promise<string>((resolve, reject) => {
      entry.settle = (result) => {
        clearTimeout(entry.timer);
        if (this.pending.get(assetId) === entry) this.pending.delete(assetId);
        if ("url" in result) resolve(result.url);
        else reject(new AssetUrlFailure(result.error));
      };
      entry.timer = setTimeout(() => entry.settle({ error: "timeout" }), this.timeoutMs);
    });
    this.pending.set(assetId, entry);
    this.deps.request(assetId);
    return entry.promise;
  }

  /** Xử lý `assetUrl` từ app. */
  receive(message: { assetId: string; url?: string; expiresAt?: number; error?: AssetUrlError }): void {
    const entry = this.pending.get(message.assetId);
    if (message.error || !message.url) {
      entry?.settle({ error: message.error ?? "failed" });
      return;
    }
    const validUntil = (message.expiresAt ?? this.now() + DEFAULT_TTL_MS) - SAFETY_MS;
    this.cache.set(message.assetId, { url: message.url, validUntil });
    entry?.settle({ url: message.url });
  }

  invalidate(assetId: string): void {
    this.cache.delete(assetId);
  }

  dispose(): void {
    for (const entry of [...this.pending.values()]) entry.settle({ error: "failed" });
    this.pending.clear();
    this.cache.clear();
  }
}
