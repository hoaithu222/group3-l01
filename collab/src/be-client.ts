import { z } from "zod";
import { BeRejectedError, BeUnavailableError } from "./errors";
import type { Logger } from "./logger";
import { errorMeta } from "./logger";
import type { CollabMetrics } from "./metrics";
import { KIND_SPECS, type ResourceKind } from "./resource-kinds";

const userSchema = z.object({ id: z.string(), name: z.string(), color: z.string() });

const accessSchema = z.discriminatedUnion("allowed", [
  z.object({
    allowed: z.literal(true),
    mode: z.enum(["edit", "view"]),
    user: userSchema,
    workspaceId: z.string(),
    limits: z.object({ maxConnections: z.number().int().positive().optional() }).optional(),
  }),
  z.object({ allowed: z.literal(false), reason: z.string().optional() }),
]);

export type AccessResponse = z.infer<typeof accessSchema>;
export type AccessGranted = Extract<AccessResponse, { allowed: true }>;

const putSchema = z.object({ yjsVersion: z.number().int().min(0), merged: z.boolean().optional() });

export interface StateResult {
  state: Uint8Array;
  version: number;
}

export interface PutStateResult {
  yjsVersion: number;
  merged: boolean;
}

export interface BeClientOptions {
  baseUrl: string;
  secret: string;
  timeoutMs: number;
  retries: number;
  logger: Logger;
  metrics?: CollabMetrics;
  fetchImpl?: typeof fetch;
  /** Ngủ giữa các lần thử lại (test đặt 0). */
  retryBaseMs?: number;
}

export const SECRET_HEADER = "X-Collab-Secret";

/**
 * Máy khách gọi BE nội bộ (`/api/internal/<documents|whiteboards>/:id/(access|state)`) — timeout mặc định 5 s, thử lại 2 lần
 * với lỗi mạng/5xx/429 (KHÔNG thử lại 4xx). BE là nguồn sự thật duy nhất: collab không cache state xuống đĩa.
 */
export class BeClient {
  private readonly fetchImpl: typeof fetch;
  /** Mốc liên lạc BE gần nhất (thành công = mọi phản hồi < 500, kể cả 4xx) — cho `/health`. */
  lastOkAt: number | null = null;
  lastErrorAt: number | null = null;

  constructor(private readonly opts: BeClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** `null` = 404 (tài nguyên không tồn tại). */
  async access(kind: ResourceKind, id: string, userId: string, sv: number): Promise<AccessResponse | null> {
    const q = new URLSearchParams({ userId, sv: String(sv) });
    const res = await this.request("access", "GET", `${this.path(kind, id)}/access?${q.toString()}`);
    if (res === null) return null;
    const json: unknown = await res.json();
    const parsed = accessSchema.safeParse(unwrap(json));
    if (!parsed.success) throw new BeUnavailableError("access", "phản hồi không đúng hợp đồng");
    return parsed.data;
  }

  /** `null` = 404. Tài nguyên chưa có state → `state` rỗng, `version` 0. */
  async getState(kind: ResourceKind, id: string): Promise<StateResult | null> {
    const res = await this.request("get-state", "GET", `${this.path(kind, id)}/state`);
    if (res === null) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const version = Number(res.headers.get("x-yjs-version") ?? "0");
    return { state: buf, version: Number.isFinite(version) ? version : 0 };
  }

  async putState(
    kind: ResourceKind,
    id: string,
    state: Uint8Array,
    meta: { baseVersion: number; editorId?: string },
  ): Promise<PutStateResult> {
    const headers: Record<string, string> = { "Content-Type": "application/octet-stream", "X-Yjs-Version": String(meta.baseVersion) };
    if (meta.editorId) headers["X-Last-Editor"] = meta.editorId;
    const res = await this.request("put-state", "PUT", `${this.path(kind, id)}/state`, { headers, body: state });
    if (res === null) throw new BeRejectedError("put-state", 404, "NOT_FOUND");
    const parsed = putSchema.safeParse(unwrap(await res.json()));
    if (!parsed.success) throw new BeUnavailableError("put-state", "phản hồi không đúng hợp đồng");
    return { yjsVersion: parsed.data.yjsVersion, merged: parsed.data.merged ?? false };
  }

  private path(kind: ResourceKind, id: string): string {
    return `${this.opts.baseUrl}/api/internal/${KIND_SPECS[kind].bePath}/${id}`;
  }

  /**
   * `null` khi 404; ném `BeRejectedError` với 4xx khác; ném `BeUnavailableError` khi hết lượt thử (mạng/timeout/5xx/429).
   */
  private async request(op: string, method: string, url: string, init: { headers?: Record<string, string>; body?: Uint8Array } = {}): Promise<Response | null> {
    const attempts = this.opts.retries + 1;
    let lastDetail = "";
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) await sleep((this.opts.retryBaseMs ?? 200) * 2 ** (attempt - 1));
      const started = process.hrtime.bigint();
      let status = "error";
      try {
        const res = await this.fetchImpl(url, {
          method,
          headers: { [SECRET_HEADER]: this.opts.secret, ...init.headers },
          ...(init.body ? { body: Buffer.from(init.body) } : {}),
          signal: AbortSignal.timeout(this.opts.timeoutMs),
        });
        status = String(res.status);
        if (res.status < 500 && res.status !== 429) this.lastOkAt = Date.now();
        if (res.status === 404) {
          await res.arrayBuffer().catch(() => undefined);
          return null;
        }
        if (res.ok) return res;
        if (res.status >= 500 || res.status === 429) {
          lastDetail = `HTTP ${res.status}`;
          await res.arrayBuffer().catch(() => undefined);
          continue;
        }
        throw new BeRejectedError(op, res.status, await readErrorCode(res));
      } catch (err) {
        if (err instanceof BeRejectedError) throw err;
        lastDetail = err instanceof Error ? err.message : String(err);
        this.opts.logger.debug("gọi BE lỗi (sẽ thử lại nếu còn lượt)", { op, attempt, ...errorMeta(err) });
      } finally {
        this.opts.metrics?.beDuration.observe({ op, status }, Number(process.hrtime.bigint() - started) / 1e9);
      }
    }
    this.lastErrorAt = Date.now();
    this.opts.metrics?.beUnavailableTotal.inc({ op });
    throw new BeUnavailableError(op, lastDetail || "không rõ");
  }
}

/** Phong bì chuẩn của BE: `{ success, data }` — bóc `data` nếu có. */
function unwrap(json: unknown): unknown {
  if (json && typeof json === "object" && "data" in json) return (json as { data: unknown }).data;
  return json;
}

async function readErrorCode(res: Response): Promise<string | undefined> {
  try {
    const body: unknown = await res.json();
    const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
    return typeof code === "string" ? code : undefined;
  } catch {
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}
