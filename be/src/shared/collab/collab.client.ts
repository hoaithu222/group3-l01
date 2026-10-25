import { env } from "../../core/config";
import { logger } from "../../infrastructure/logger";
import type { CollabKind } from "./collab-token.service";

/**
 * Máy khách BE → service `collab/` (`COLLAB_INTERNAL_URL`, header `X-Collab-Secret`). MỌI lời gọi là best-effort: KHÔNG BAO GIỜ ném lỗi
 * (collab tắt/chậm/sập không được làm hỏng request của người dùng hay job) — trả `{ ok: false }` để caller quyết định. Lệnh theo tài liệu kèm
 * `?doc=<id>` để load balancer băm sticky (nginx `hash $arg_doc`) đưa lệnh tới đúng instance đang giữ tài liệu.
 * Hợp đồng đầy đủ: `collab/README.md` §4.2.
 */
export type CollabCallResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface CollabKickInput {
  kind?: CollabKind;
  docId?: string;
  userId?: string;
  workspaceId?: string;
  reason: "revoked" | "archived" | "forbidden";
}

export interface CollabHealth {
  /** `disabled` = chưa cấu hình/cờ tắt (không gọi mạng); `down` = không phản hồi. */
  status: "ok" | "degraded" | "down" | "disabled";
  /**
   * Kiểm bí mật dùng chung (`GET /internal/stats` kèm `X-Collab-Secret`): `rejected` = collab từ chối bí mật của BE (lệch `COLLAB_SHARED_SECRET`)
   * ⇒ `status` bị hạ về `degraded`; `unknown` = lời gọi kiểm lỗi/quá hạn (KHÔNG hạ trạng thái). Thiếu = không kiểm (BE chưa có bí mật, collab không phản hồi).
   */
  auth?: "ok" | "rejected" | "unknown";
  detail?: Record<string, unknown>;
}

export interface ICollabClient {
  /** Đã cấu hình `COLLAB_INTERNAL_URL` + `COLLAB_SHARED_SECRET`. */
  enabled(): boolean;
  health(timeoutMs?: number): Promise<CollabHealth>;
  kick(input: CollabKickInput): Promise<CollabCallResult<{ closed: number }>>;
  flush(kind: CollabKind, docId: string): Promise<CollabCallResult<{ open: boolean; flushed: boolean; yjsVersion: number | null }>>;
  apply(kind: CollabKind, docId: string, update: Uint8Array, reason?: string): Promise<CollabCallResult<{ open: boolean; applied: boolean; connections: number }>>;
  stats(): Promise<CollabCallResult<{ connections: Record<string, number>; documents: Record<string, number>; pendingStates: number }>>;
}

const DEFAULT_TIMEOUT_MS = 5000;

interface Config {
  baseUrl: () => string | undefined;
  secret: () => string | undefined;
  fetchImpl?: typeof fetch;
}

export class HttpCollabClient implements ICollabClient {
  constructor(
    private readonly cfg: Config = { baseUrl: () => env.COLLAB_INTERNAL_URL, secret: () => env.COLLAB_SHARED_SECRET }
  ) {}

  enabled(): boolean {
    return Boolean(this.cfg.baseUrl() && this.cfg.secret());
  }

  /**
   * Hai lời gọi SONG SONG (cùng hạn `timeoutMs`): `GET /health` (không cần bí mật — collab còn sống không) và, khi BE có bí mật, `GET /internal/stats`
   * để kiểm CẢ bí mật dùng chung. ⚠️ Chỉ `/health` thì mù với lỗi cấu hình hay gặp nhất: đổi `COLLAB_SHARED_SECRET` mà collab chưa DEPLOY lại
   * (Restart của Railway giữ biến cũ) ⇒ `/health` vẫn `ok` nhưng collab từ chối chữ ký MỌI token BE cấp (`unauthorized`) — app báo "Mất phiên vẽ"
   * / "Mất phiên soạn thảo" (sự cố 28/09/2026). Lỗi mạng ở lời gọi kiểm bí mật KHÔNG hạ trạng thái: `/health` đã chứng minh collab sống.
   */
  async health(timeoutMs = 1000): Promise<CollabHealth> {
    const base = this.cfg.baseUrl();
    if (!base) return { status: "disabled" };
    const root = base.replace(/\/+$/, "");
    const [live, auth] = await Promise.all([this.liveness(root, timeoutMs), this.secretCheck(root, timeoutMs)]);
    if (live.status === "down" || !auth) return live;
    return { ...live, status: auth === "rejected" ? "degraded" : live.status, auth };
  }

  kick(input: CollabKickInput) {
    return this.post<{ closed: number }>("/internal/kick", input, input.docId);
  }

  flush(kind: CollabKind, docId: string) {
    return this.post<{ open: boolean; flushed: boolean; yjsVersion: number | null }>("/internal/flush", { kind, docId }, docId);
  }

  apply(kind: CollabKind, docId: string, update: Uint8Array, reason = "restore") {
    return this.post<{ open: boolean; applied: boolean; connections: number }>(
      "/internal/apply",
      { kind, docId, updateBase64: Buffer.from(update).toString("base64"), reason },
      docId
    );
  }

  stats() {
    return this.request<{ connections: Record<string, number>; documents: Record<string, number>; pendingStates: number }>("GET", "/internal/stats");
  }

  private async liveness(root: string, timeoutMs: number): Promise<CollabHealth> {
    try {
      const res = await (this.cfg.fetchImpl ?? fetch)(`${root}/health`, { signal: AbortSignal.timeout(timeoutMs) });
      const body = (await res.json().catch(() => ({}))) as { status?: string } & Record<string, unknown>;
      if (!res.ok) return { status: "degraded", detail: { httpStatus: res.status } };
      return { status: body.status === "ok" ? "ok" : "degraded", detail: body };
    } catch {
      return { status: "down" };
    }
  }

  /** `undefined` = BE chưa có bí mật (không kiểm) · `rejected` = 401/403 (bí mật lệch) · `ok` · `unknown` (HTTP khác/lỗi mạng/quá hạn). */
  private async secretCheck(root: string, timeoutMs: number): Promise<CollabHealth["auth"]> {
    const secret = this.cfg.secret();
    if (!secret) return undefined;
    try {
      const res = await (this.cfg.fetchImpl ?? fetch)(`${root}/internal/stats`, { headers: { "X-Collab-Secret": secret }, signal: AbortSignal.timeout(timeoutMs) });
      await res.arrayBuffer().catch(() => undefined); // đọc hết thân để trả kết nối về pool
      if (res.status === 401 || res.status === 403) return "rejected";
      return res.ok ? "ok" : "unknown";
    } catch {
      return "unknown";
    }
  }

  private post<T>(path: string, body: unknown, docHint?: string): Promise<CollabCallResult<T>> {
    return this.request<T>("POST", path, body, docHint);
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown, docHint?: string): Promise<CollabCallResult<T>> {
    const base = this.cfg.baseUrl();
    const secret = this.cfg.secret();
    if (!base || !secret) return { ok: false, error: "collab chưa cấu hình" };
    const url = `${base.replace(/\/+$/, "")}${path}${docHint ? `?doc=${encodeURIComponent(docHint)}` : ""}`;
    try {
      const res = await (this.cfg.fetchImpl ?? fetch)(url, {
        method,
        headers: { "X-Collab-Secret": secret, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
      const json = (await res.json().catch(() => null)) as { data?: T } | null;
      if (!res.ok || !json || json.data === undefined) return { ok: false, error: `HTTP ${res.status}` };
      return { ok: true, data: json.data };
    } catch (err) {
      logger.warn("[collab] lời gọi tới collab lỗi", { path, error: err instanceof Error ? err.message : String(err) });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

/** Không cấu hình collab / test: mọi lời gọi thất bại êm. */
export class NoopCollabClient implements ICollabClient {
  enabled(): boolean {
    return false;
  }
  async health(): Promise<CollabHealth> {
    return { status: "disabled" };
  }
  async kick() {
    return { ok: false, error: "collab tắt" } as const;
  }
  async flush() {
    return { ok: false, error: "collab tắt" } as const;
  }
  async apply() {
    return { ok: false, error: "collab tắt" } as const;
  }
  async stats() {
    return { ok: false, error: "collab tắt" } as const;
  }
}

let shared: ICollabClient | null = null;

/** Singleton dùng chung API + worker (đọc env lười mỗi lần gọi). Test thay bằng `setCollabClientForTests`. */
export function getCollabClient(): ICollabClient {
  shared ??= new HttpCollabClient();
  return shared;
}

export function setCollabClientForTests(client: ICollabClient | null): void {
  shared = client;
}
