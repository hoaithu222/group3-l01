import type { IncomingHttpHeaders } from "node:http";
import type { IntegrationProviderValue } from "../../../core/constants/integration";
import type { IntegrationConfig, IntegrationMessagePayload, WatchedResource } from "../entities/integration.interface";

/**
 * Cổng DUY NHẤT để module tích hợp nói chuyện với GitHub/GitLab/Google/Figma (p5-03 README §9 #3). MỌI gọi mạng ra ngoài đi qua adapter cài đặt
 * interface này (bọc `fetch` có timeout + allowlist host — `provider-http.ts`); test dùng adapter giả, KHÔNG gọi mạng thật, KHÔNG cần khoá thật.
 */

/** Token OAuth đã giải mã (chỉ tồn tại trong bộ nhớ khi gọi nhà cung cấp — lưu DB luôn ở dạng mã hoá). */
export interface TokenSet {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes?: string[];
}

/** Bí mật lưu trong `credentials` (mã hoá cả khối): token + secret webhook của kết nối (để tạo hook mới cho tài nguyên thêm sau). */
export interface StoredCredentials {
  accessToken?: string;
  refreshToken?: string | null;
  webhookSecret?: string;
}

/** Token bị từ chối vĩnh viễn (`invalid_grant`, 401/403 khi đã làm mới, cài đặt đã bị gỡ) → kết nối `REVOKED`. */
export class ProviderAuthError extends Error {
  constructor(
    readonly code: "invalid_grant" | "unauthorized" | "forbidden" | "not_found",
    message: string
  ) {
    super(message);
    this.name = "ProviderAuthError";
  }
}

/** Mạng/5xx/429/quá hạn — tạm thời: service ánh xạ `INT_004` (502), job thử lại. */
export class ProviderUnavailableError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

export interface AuthorizeInput {
  /** Nonce một lần do `OAuthStateStore` cấp (chống CSRF). */
  state: string;
  redirectUri: string;
  /** PKCE (S256) — chỉ nhà cung cấp OAuth2 thông thường. */
  codeChallenge?: string;
}

export interface ExchangeInput {
  code?: string;
  /** GitHub App: `installation_id` từ callback — LUÔN được xác minh thuộc về người dùng đã uỷ quyền (`code`). */
  installationId?: string;
  redirectUri: string;
  codeVerifier?: string;
}

export interface ExchangeResult {
  /** GitHub: installationId · GitLab/Figma: id người dùng · Google: email. */
  externalAccountId: string;
  externalName: string;
  tokens?: TokenSet;
  scopes?: string[];
}

/** Ngữ cảnh gọi nhà cung cấp cho một kết nối (token đã giải mã/làm mới bởi `TokenService`). */
export interface ProviderCallContext {
  externalAccountId: string;
  tokens: TokenSet | null;
  webhookSecret?: string;
  externalHookIds?: string[];
}

export interface ResourcePage {
  items: WatchedResource[];
  hasMore: boolean;
}

export interface WebhookVerifyContext {
  /** GitLab/Figma dùng secret riêng từng kết nối: tra kết nối theo sha256(secret) (chỉ trả `id` + hash để so sánh hằng thời gian). */
  findBySecretHash(hash: string): Promise<{ id: string; webhookSecretHash: string } | null>;
}

export type WebhookVerification = { ok: true; integrationId?: string } | { ok: false };

/** Sự kiện webhook đã tách để dispatcher lọc/ghi (payload đã LỌC dữ liệu nhạy cảm, an toàn để lưu). */
export interface ParsedWebhook {
  /** Khoá dedupe (id giao hàng của nhà cung cấp); trùng → không xử lý lại. */
  eventId: string;
  /** `push` | `pull_request` | `issues` | `release` | `merge_request` | `note` | `FILE_UPDATE` | `FILE_COMMENT` | `ping` … */
  eventType: string;
  action?: string;
  /** GitHub: installation id — khoá tra kết nối. */
  externalAccountId?: string;
  /** Repo id / project id / file key — để so với `config.repos`. */
  resourceId?: string;
  resourceName?: string;
  /** Sự kiện vòng đời cài đặt (không phải tin nhắn): cập nhật trạng thái kết nối. */
  lifecycle?: "REVOKED" | "SUSPENDED" | "UNSUSPENDED";
  payload: Record<string, unknown>;
}

export interface IntegrationProvider {
  readonly provider: IntegrationProviderValue;
  readonly kind: "WORKSPACE" | "USER";
  /** OAuth2 có PKCE (S256): service sinh verifier, gửi `codeChallenge` khi dựng URL và `codeVerifier` khi đổi mã. */
  readonly usesPkce?: boolean;
  /** Đủ khoá env? (thiếu → `available=false`, không chặn khởi động). */
  isConfigured(): boolean;
  /** Dựng URL uỷ quyền/cài đặt (host cố định của nhà cung cấp, KHÔNG nhận URL từ người dùng). */
  authorizeUrl(input: AuthorizeInput): string;
  /** Callback → định danh tài khoản ngoài (+ token nếu có). */
  exchange(input: ExchangeInput): Promise<ExchangeResult>;
  /** Làm mới token; `invalid_grant` → ném `ProviderAuthError`. */
  refresh?(tokens: TokenSet): Promise<TokenSet>;
  /** Thu hồi token phía nhà cung cấp (best-effort). */
  revoke?(ctx: ProviderCallContext): Promise<void>;
  /** Xác thực webhook TRÊN RAW body bằng so sánh hằng thời gian. Không hợp lệ → `{ ok: false }` (dispatcher trả 401 `INT_007`, không ghi gì). */
  verifyWebhook?(rawBody: Buffer, headers: IncomingHttpHeaders, ctx: WebhookVerifyContext): Promise<WebhookVerification>;
  /** Tách sự kiện từ body/headers đã xác thực; `null` = không đọc được. */
  parseWebhook?(rawBody: Buffer, headers: IncomingHttpHeaders): ParsedWebhook | null;
  /** payload đã lưu → nội dung tin hệ thống; `null` = loại/hành động không hỗ trợ (→ `IGNORED`). */
  mapEvent?(type: string, payload: Record<string, unknown>): IntegrationMessagePayload | null;
  /** Danh sách tài nguyên chọn theo dõi (repo/project). */
  listResources?(ctx: ProviderCallContext, query: { query?: string; page?: number }): Promise<ResourcePage>;
  /** Đồng bộ hook phía nhà cung cấp với danh sách tài nguyên/loại sự kiện mới; trả `externalHookIds` sau đồng bộ. */
  syncHooks?(
    ctx: ProviderCallContext,
    input: { config: IntegrationConfig; endpoint: string; secret: string }
  ): Promise<string[]>;
  /** Xoá mọi hook đã tạo (best-effort). */
  removeHooks?(ctx: ProviderCallContext): Promise<void>;
  /** Kiểm sức khoẻ kết nối (cron giờ): còn tồn tại/còn hook không. */
  checkHealth?(ctx: ProviderCallContext): Promise<"OK" | "REVOKED" | "HOOK_MISSING">;
}
