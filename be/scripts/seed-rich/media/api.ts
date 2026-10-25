import { randomUUID } from "crypto";

/**
 * Máy khách HTTP tối giản cho API Super App — dùng đúng luồng của app (đăng nhập bằng nonce, đăng ký tệp, tải nội dung, chờ READY).
 * Tự nghỉ khi bị giới hạn tốc độ (429) và đăng nhập lại khi token hết hạn.
 */
export interface ApiResult<T = unknown> {
  status: number;
  data: T;
  raw: unknown;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: unknown
  ) {
    super(`HTTP ${status} ${path}: ${JSON.stringify(body).slice(0, 300)}`);
  }
}

/** Worker từ chối tệp sau khi kiểm chữ ký (REJECTED) — khác lỗi mạng/HTTP, không nên thử lại cùng nội dung. */
export class AssetRejectedError extends Error {}

export class Session {
  private token = "";
  userId = "";

  constructor(
    private readonly base: string,
    readonly email: string,
    private readonly password: string
  ) {}

  async login(): Promise<void> {
    const nonce = (await this.request<{ nonce: string }>("GET", "/auth/nonce", undefined, false)).data.nonce;
    const res = await this.request<{ accessToken: string; user: { id: string } }>("POST", "/auth/login", { email: this.email, password: this.password, nonce }, false);
    this.token = res.data.accessToken;
    this.userId = res.data.user.id;
  }

  async logout(): Promise<void> {
    try {
      await this.request("POST", "/auth/logout", {});
    } catch {
      // Phiên sẽ tự hết hạn.
    }
  }

  async request<T = unknown>(method: string, path: string, body?: unknown, auth = true, attempt = 0, idemKey = `idem-${randomUUID()}`): Promise<ApiResult<T>> {
    // Mọi thao tác ghi đều cần Idempotency-Key; thử lại (429/5xx/401) dùng lại đúng khoá.
    const headers: Record<string, string> = method === "GET" ? {} : { "Idempotency-Key": idemKey };
    let payload: string | FormData | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    if (auth && this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await fetch(this.base + path, { method, headers, body: payload });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    if (res.status === 429 && attempt < 6) {
      const reset = Number(res.headers.get("ratelimit-reset") ?? res.headers.get("retry-after") ?? 30);
      console.log(`    … bị giới hạn tốc độ, nghỉ ${Math.min(reset, 960)}s`);
      await sleep(Math.min(reset, 960) * 1000 + 1500);
      return this.request<T>(method, path, body, auth, attempt + 1, idemKey);
    }
    if (res.status === 401 && auth && attempt < 2 && path !== "/auth/login") {
      await this.login();
      return this.request<T>(method, path, body, auth, attempt + 1, idemKey);
    }
    if (res.status >= 500 && attempt < 3) {
      await sleep(1500 * (attempt + 1));
      return this.request<T>(method, path, body, auth, attempt + 1, idemKey);
    }
    if (res.status >= 400) throw new ApiError(res.status, `${method} ${path}`, json);
    const data = (json as { data?: T } | undefined)?.data as T;
    return { status: res.status, data, raw: json };
  }

  get<T = unknown>(path: string): Promise<ApiResult<T>> {
    return this.request<T>("GET", path);
  }
}

export interface UploadedAsset {
  id: string;
  size: number;
}

interface CreateAssetResponse {
  asset: { id: string };
  upload: { method: "API_PUT" | "PRESIGNED_PUT"; url: string; headers?: Record<string, string> };
}

/** Đăng ký tệp → tải nội dung → chờ asset READY (worker kiểm tra chữ ký tệp). Trả id asset. */
export async function uploadAsset(
  s: Session,
  input: { scope: string; kind: "IMAGE" | "FILE"; fileName: string; mime: string; buffer: Buffer; workspaceId?: string }
): Promise<UploadedAsset> {
  const created = await s.request<CreateAssetResponse>("POST", "/assets", {
    scope: input.scope,
    kind: input.kind,
    fileName: input.fileName,
    mime: input.mime,
    size: input.buffer.length,
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
  });
  const id = created.data.asset.id;
  const { upload } = created.data;
  if (upload.method === "API_PUT") {
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array(input.buffer)], { type: input.mime }), input.fileName);
    await s.request("PUT", `/assets/${id}/content`, fd);
  } else {
    const put = await fetch(upload.url, { method: "PUT", headers: { "Content-Type": input.mime, ...(upload.headers ?? {}) }, body: new Uint8Array(input.buffer) });
    if (!put.ok) throw new ApiError(put.status, "PUT presigned", await put.text());
    await s.request("POST", `/assets/${id}/complete`, { size: input.buffer.length });
  }
  for (let i = 0; i < 40; i++) {
    const asset = (await s.get<{ status: string; rejectReason?: string }>(`/assets/${id}`)).data;
    if (asset.status === "READY") return { id, size: input.buffer.length };
    if (asset.status === "REJECTED" || asset.status === "DELETED") throw new AssetRejectedError(`Asset ${id} bị ${asset.status}: ${asset.rejectReason ?? ""}`);
    await sleep(1500);
  }
  throw new Error(`Asset ${id} chưa READY sau 60s (worker có đang chạy không?)`);
}

