import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import jwt from "jsonwebtoken";
import { env } from "../../../core/config";
import { isIntegrationProviderConfigured } from "../../../core/config/integration-env";
import { normalizeSearch } from "../../../core/utils/normalize";
import { mapGithubEvent } from "./event-mappers/github.mapper";
import { asArray, asRecord } from "./event-mappers/mapper-utils";
import { payloadForStorage } from "./payload-redactor";
import { formBody, ProviderHttp } from "./provider-http";
import {
  ProviderAuthError,
  ProviderUnavailableError,
  type AuthorizeInput,
  type ExchangeInput,
  type ExchangeResult,
  type IntegrationProvider,
  type ParsedWebhook,
  type ProviderCallContext,
  type ResourcePage,
  type WebhookVerification,
} from "./provider.interface";
import type { ITokenCache } from "./token-cache";

export const GITHUB_HOSTS = ["api.github.com", "github.com"] as const;
const API = "https://api.github.com";
const INSTALLATION_TOKEN_TTL_SECONDS = 50 * 60;
const PAGE_SIZE = 50;
const SEARCH_MAX_PAGES = 5;

export interface GithubAppConfig {
  appId: string;
  privateKey: string;
  slug: string;
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
}

/** `\n` dạng chuỗi 2 ký tự (đặt PEM trong một dòng env) → xuống dòng thật. */
export function normalizePrivateKey(pem: string): string {
  return pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
}

export function githubConfigFromEnv(): GithubAppConfig {
  return {
    appId: env.GITHUB_APP_ID ?? "",
    privateKey: normalizePrivateKey(env.GITHUB_APP_PRIVATE_KEY ?? ""),
    slug: env.GITHUB_APP_SLUG ?? "",
    clientId: env.GITHUB_APP_CLIENT_ID ?? "",
    clientSecret: env.GITHUB_APP_CLIENT_SECRET ?? "",
    webhookSecret: env.GITHUB_WEBHOOK_SECRET ?? "",
  };
}

/** So sánh chữ ký HMAC theo HẰNG THỜI GIAN (độ dài khác → sai ngay, vì `timingSafeEqual` ném lỗi khi độ dài lệch). */
export function safeEqualHex(expected: Buffer, providedHex: string): boolean {
  if (!/^[0-9a-f]+$/i.test(providedHex) || providedHex.length !== expected.length * 2) return false;
  return timingSafeEqual(expected, Buffer.from(providedHex, "hex"));
}

function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const v = headers[name];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * GitHub App (README §2: chọn GitHub App, không OAuth App): không lưu token người dùng dài hạn — installation token (1 giờ) sinh theo yêu cầu bằng
 * JWT của App (RS256, 9 phút) và cache 50 phút. Người cài đặt được XÁC MINH sở hữu `installation_id` qua OAuth khi cài đặt (`code` → `GET /user/installations`),
 * nếu không ai cũng có thể "nhận" cài đặt của tổ chức khác chỉ bằng cách đoán số `installation_id`.
 */
export class GithubAppProvider implements IntegrationProvider {
  readonly provider = "GITHUB" as const;
  readonly kind = "WORKSPACE" as const;

  constructor(
    private readonly http: ProviderHttp,
    private readonly cache: ITokenCache,
    private readonly cfg: () => GithubAppConfig = githubConfigFromEnv,
    private readonly now: () => number = Date.now
  ) {}

  isConfigured(): boolean {
    return isIntegrationProviderConfigured("GITHUB");
  }

  authorizeUrl(input: AuthorizeInput): string {
    const { slug } = this.cfg();
    if (!/^[A-Za-z0-9-]+$/.test(slug)) throw new Error("[integrations] GITHUB_APP_SLUG không hợp lệ");
    return `https://github.com/apps/${slug}/installations/new?state=${encodeURIComponent(input.state)}`;
  }

  /** JWT App (RS256) sống 9 phút (GitHub cho tối đa 10). `iat` lùi 60 s bù lệch đồng hồ. */
  appJwt(): string {
    const c = this.cfg();
    const nowSec = Math.floor(this.now() / 1000);
    return jwt.sign({ iat: nowSec - 60, exp: nowSec + 9 * 60, iss: c.appId }, c.privateKey, { algorithm: "RS256" });
  }

  private appHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.appJwt()}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "super-app-integrations" };
  }

  async installationToken(installationId: string): Promise<string> {
    const cached = await this.cache.get(`github:${installationId}`);
    if (cached) return cached;
    const res = await this.http.json<{ token?: string }>(`${API}/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
      method: "POST",
      headers: this.appHeaders(),
    });
    if (!res?.token) throw new ProviderUnavailableError("GitHub không cấp installation token");
    await this.cache.set(`github:${installationId}`, res.token, INSTALLATION_TOKEN_TTL_SECONDS);
    return res.token;
  }

  async exchange(input: ExchangeInput): Promise<ExchangeResult> {
    const installationId = input.installationId ?? "";
    if (!/^\d{1,20}$/.test(installationId) || !input.code) throw new ProviderAuthError("forbidden", "Thiếu installation_id hoặc mã uỷ quyền");
    const c = this.cfg();
    const tokenRes = await this.http.send("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "super-app-integrations" },
      body: formBody({ client_id: c.clientId, client_secret: c.clientSecret, code: input.code, redirect_uri: input.redirectUri }),
    });
    if (tokenRes.status >= 500) throw new ProviderUnavailableError("GitHub không phản hồi", tokenRes.status);
    let userToken: string | undefined;
    try {
      userToken = (JSON.parse(tokenRes.body || "{}") as { access_token?: string }).access_token;
    } catch {
      throw new ProviderUnavailableError("Phản hồi của GitHub không phải JSON", tokenRes.status);
    }
    if (!userToken) throw new ProviderAuthError("invalid_grant", "Mã uỷ quyền GitHub không hợp lệ");
    if (!(await this.userOwnsInstallation(userToken, installationId))) {
      throw new ProviderAuthError("forbidden", "Tài khoản GitHub này không có quyền với cài đặt được chọn");
    }
    const detail = await this.http.json<{ account?: { login?: string } }>(`${API}/app/installations/${installationId}`, { headers: this.appHeaders() });
    const login = detail?.account?.login;
    if (!login) throw new ProviderUnavailableError("GitHub không trả tài khoản của cài đặt");
    return { externalAccountId: installationId, externalName: login, scopes: [] };
  }

  private async userOwnsInstallation(userToken: string, installationId: string): Promise<boolean> {
    for (let page = 1; page <= SEARCH_MAX_PAGES; page += 1) {
      const res = await this.http.json<{ installations?: Array<{ id?: number }> }>(`${API}/user/installations?per_page=100&page=${page}`, {
        headers: { Authorization: `Bearer ${userToken}`, Accept: "application/vnd.github+json", "User-Agent": "super-app-integrations" },
      });
      const list = res?.installations ?? [];
      if (list.some((i) => String(i.id) === installationId)) return true;
      if (list.length < 100) return false;
    }
    return false;
  }

  async listResources(ctx: ProviderCallContext, query: { query?: string; page?: number }): Promise<ResourcePage> {
    const token = await this.installationToken(ctx.externalAccountId);
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "super-app-integrations" };
    const fetchPage = async (page: number): Promise<{ items: Array<{ id: string; fullName: string }>; total: number }> => {
      const res = await this.http.json<{ total_count?: number; repositories?: unknown[] }>(`${API}/installation/repositories?per_page=${PAGE_SIZE}&page=${page}`, { headers });
      const items = asArray(res?.repositories)
        .map(asRecord)
        .filter((r): r is Record<string, unknown> => r !== null && typeof r.id === "number" && typeof r.full_name === "string")
        .map((r) => ({ id: String(r.id), fullName: String(r.full_name) }));
      return { items, total: res?.total_count ?? items.length };
    };
    const q = normalizeSearch(query.query ?? "");
    if (!q) {
      const page = Math.max(1, query.page ?? 1);
      const { items, total } = await fetchPage(page);
      return { items, hasMore: page * PAGE_SIZE < total };
    }
    const matches: ResourcePage["items"] = [];
    for (let page = 1; page <= SEARCH_MAX_PAGES && matches.length < PAGE_SIZE; page += 1) {
      const { items, total } = await fetchPage(page);
      matches.push(...items.filter((i) => normalizeSearch(i.fullName).includes(q)));
      if (page * PAGE_SIZE >= total) break;
    }
    return { items: matches.slice(0, PAGE_SIZE), hasMore: false };
  }

  verifyWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): Promise<WebhookVerification> {
    const secret = this.cfg().webhookSecret;
    const provided = header(headers, "x-hub-signature-256");
    if (!secret || !provided?.startsWith("sha256=") || !header(headers, "x-github-delivery")) return Promise.resolve({ ok: false });
    const expected = createHmac("sha256", secret).update(rawBody).digest();
    return Promise.resolve(safeEqualHex(expected, provided.slice("sha256=".length)) ? { ok: true } : { ok: false });
  }

  parseWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): ParsedWebhook | null {
    const eventId = header(headers, "x-github-delivery");
    const eventType = header(headers, "x-github-event");
    if (!eventId || !eventType) return null;
    let body: unknown;
    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return null;
    }
    const p = asRecord(body);
    if (!p) return null;
    const installation = asRecord(p.installation);
    const repository = asRecord(p.repository);
    const action = typeof p.action === "string" ? p.action : undefined;
    const lifecycle =
      eventType === "installation" ? (action === "deleted" ? "REVOKED" : action === "suspend" ? "SUSPENDED" : action === "unsuspend" ? "UNSUSPENDED" : undefined) : undefined;
    return {
      eventId,
      eventType,
      ...(action ? { action } : {}),
      ...(installation?.id !== undefined ? { externalAccountId: String(installation.id) } : {}),
      ...(repository?.id !== undefined ? { resourceId: String(repository.id) } : {}),
      ...(typeof repository?.full_name === "string" ? { resourceName: repository.full_name } : {}),
      ...(lifecycle ? { lifecycle } : {}),
      payload: payloadForStorage(p),
    };
  }

  mapEvent = mapGithubEvent;

  async checkHealth(ctx: ProviderCallContext): Promise<"OK" | "REVOKED"> {
    try {
      await this.http.json(`${API}/app/installations/${encodeURIComponent(ctx.externalAccountId)}`, { headers: this.appHeaders() });
      return "OK";
    } catch (err) {
      if (err instanceof ProviderAuthError && err.code === "not_found") return "REVOKED";
      throw err;
    }
  }
}
