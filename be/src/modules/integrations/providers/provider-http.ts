import { LIMITS } from "../../../core/constants/limits";
import { ProviderAuthError, ProviderUnavailableError } from "./provider.interface";

/**
 * Lớp HTTP DUY NHẤT gọi ra nhà cung cấp (p5-03): bọc `fetch` bằng (1) allowlist HOST — server chỉ gọi host của nhà cung cấp, KHÔNG BAO GIỜ URL do người dùng
 * nhập (chống SSRF); (2) timeout `LIMITS.integration.providerTimeoutMs` tính cả lúc đọc body; (3) trần kích thước phản hồi; (4) chuẩn hoá lỗi.
 * Test truyền `fetchImpl` giả — không gọi mạng thật.
 */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface HttpResult {
  status: number;
  headers: Headers;
  body: string;
}

/** 4xx không phải lỗi xác thực (yêu cầu sai) — thử lại không có ích. */
export class ProviderRejectedError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string
  ) {
    super(message);
    this.name = "ProviderRejectedError";
  }
}

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

/** Chỉ https, host thuộc allowlist, không nhúng tài khoản trong URL. Ném `Error` (lỗi lập trình/SSRF, không phải lỗi nhà cung cấp). */
export function assertAllowedUrl(raw: string, allowedHosts: readonly string[]): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error(`[integrations] Chỉ cho phép https: ${url.protocol}`);
  if (url.username || url.password) throw new Error("[integrations] URL không được chứa thông tin đăng nhập");
  if (!allowedHosts.includes(url.hostname.toLowerCase())) throw new Error(`[integrations] Host không nằm trong allowlist: ${url.hostname}`);
  return url;
}

export function formBody(fields: Record<string, string | undefined>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) body.set(k, v);
  return body;
}

export class ProviderHttp {
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(
    private readonly allowedHosts: readonly string[],
    opts: { fetchImpl?: FetchLike; timeoutMs?: number } = {}
  ) {
    this.fetchImpl = opts.fetchImpl ?? ((url, init) => fetch(url, init));
    this.timeoutMs = opts.timeoutMs ?? LIMITS.integration.providerTimeoutMs;
  }

  /** Gửi yêu cầu, đọc trọn body trong khung timeout. Mạng/quá hạn/phản hồi quá lớn → `ProviderUnavailableError`. */
  async send(rawUrl: string, init: RequestInit = {}): Promise<HttpResult> {
    const url = assertAllowedUrl(rawUrl, this.allowedHosts);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref?.();
    try {
      const res = await this.fetchImpl(url.toString(), { ...init, redirect: "error", signal: controller.signal });
      const length = Number(res.headers.get("content-length") ?? 0);
      if (length > MAX_RESPONSE_BYTES) throw new ProviderUnavailableError("Phản hồi của nhà cung cấp quá lớn", res.status);
      const body = await res.text();
      if (body.length > MAX_RESPONSE_BYTES) throw new ProviderUnavailableError("Phản hồi của nhà cung cấp quá lớn", res.status);
      return { status: res.status, headers: res.headers, body };
    } catch (err) {
      if (err instanceof ProviderUnavailableError) throw err;
      const aborted = err instanceof Error && err.name === "AbortError";
      throw new ProviderUnavailableError(aborted ? `Nhà cung cấp không phản hồi trong ${this.timeoutMs} ms` : "Không kết nối được nhà cung cấp");
    } finally {
      clearTimeout(timer);
    }
  }

  /** Gửi + phân loại trạng thái: 2xx → JSON (body rỗng → `null`); 401/403/404 → `ProviderAuthError`; 429/5xx → `ProviderUnavailableError`; 4xx khác → `ProviderRejectedError`. */
  async json<T>(rawUrl: string, init: RequestInit = {}): Promise<T> {
    const res = await this.send(rawUrl, init);
    if (res.status >= 200 && res.status < 300) {
      if (!res.body) return null as T;
      try {
        return JSON.parse(res.body) as T;
      } catch {
        throw new ProviderUnavailableError("Phản hồi của nhà cung cấp không phải JSON", res.status);
      }
    }
    throw classifyFailure(res);
  }
}

/** Cùng bảng phân loại cho mọi lời gọi (dùng lại ở các adapter khi tự đọc `HttpResult`). */
export function classifyFailure(res: HttpResult): Error {
  const { status } = res;
  const limited = res.headers.get("x-ratelimit-remaining") === "0" || res.headers.has("retry-after");
  if (status === 429 || status >= 500 || (status === 403 && limited)) return new ProviderUnavailableError(`Nhà cung cấp trả ${status}`, status);
  if (status === 401) return new ProviderAuthError("unauthorized", "Token không còn hợp lệ");
  if (status === 403) return new ProviderAuthError("forbidden", "Nhà cung cấp từ chối quyền truy cập");
  if (status === 404) return new ProviderAuthError("not_found", "Không tìm thấy tài nguyên ở nhà cung cấp");
  return new ProviderRejectedError(`Nhà cung cấp từ chối yêu cầu (${status})`, status, res.body.slice(0, 300));
}
