import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { env } from "../../../core/config";
import { isIntegrationProviderConfigured } from "../../../core/config/integration-env";
import { asArray, asRecord } from "./event-mappers/mapper-utils";
import { mapGitlabEvent } from "./event-mappers/gitlab.mapper";
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
  type TokenSet,
  type WebhookVerification,
  type WebhookVerifyContext,
} from "./provider.interface";
import type { IntegrationConfig } from "../entities/integration.interface";

export interface GitlabConfig {
  clientId: string;
  clientSecret: string;
  /** Gốc GitLab do VẬN HÀNH đặt (`GITLAB_BASE_URL`) — không bao giờ nhận từ người dùng. */
  baseUrl: string;
}

export function gitlabConfigFromEnv(): GitlabConfig {
  return { clientId: env.GITLAB_CLIENT_ID ?? "", clientSecret: env.GITLAB_CLIENT_SECRET ?? "", baseUrl: env.GITLAB_BASE_URL.replace(/\/+$/, "") };
}

/** Sự kiện GitLab (`object_kind`) → tên loại sự kiện trong `Integration.config.events`. */
const KIND_TO_EVENT: Record<string, string> = { push: "push", merge_request: "merge_request", issue: "issues", note: "note", release: "release" };
const EVENT_FLAGS: Record<string, string> = { push: "push_events", merge_request: "merge_requests_events", issues: "issues_events", note: "note_events", release: "releases_events" };
const PAGE_SIZE = 50;
const sha256 = (v: string): string => createHash("sha256").update(v).digest("hex");

function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const v = headers[name];
  return Array.isArray(v) ? v[0] : v;
}

/** `<projectId>:<hookId>` (id hook lưu trong `Integration.externalHookIds`). */
function splitHookId(raw: string): { project: string; hook: string } | null {
  const [project, hook] = raw.split(":");
  return project && hook ? { project, hook } : null;
}

/**
 * GitLab (P1, README §1): OAuth2 + PKCE (scope `api` để tạo project hook), token hết hạn 2 giờ → làm mới bằng refresh token. Webhook dùng secret RIÊNG từng kết nối
 * (`X-Gitlab-Token`, chỉ lưu sha256 + bản mã hoá trong `credentials`) — tra kết nối theo hash rồi so sánh hằng thời gian. Mọi gọi ra chỉ tới host GitLab của vận hành.
 */
export class GitlabProvider implements IntegrationProvider {
  readonly provider = "GITLAB" as const;
  readonly kind = "WORKSPACE" as const;
  readonly usesPkce = true;

  constructor(
    private readonly http: ProviderHttp,
    private readonly cfg: () => GitlabConfig = gitlabConfigFromEnv,
    private readonly now: () => number = Date.now
  ) {}

  isConfigured(): boolean {
    return isIntegrationProviderConfigured("GITLAB");
  }

  private get hosts(): string[] {
    return [new URL(this.cfg().baseUrl).hostname];
  }

  authorizeUrl(input: AuthorizeInput): string {
    const c = this.cfg();
    const q = new URLSearchParams({ client_id: c.clientId, redirect_uri: input.redirectUri, response_type: "code", state: input.state, scope: "api" });
    if (input.codeChallenge) {
      q.set("code_challenge", input.codeChallenge);
      q.set("code_challenge_method", "S256");
    }
    return `${c.baseUrl}/oauth/authorize?${q.toString()}`;
  }

  private async token(fields: Record<string, string | undefined>): Promise<TokenSet> {
    const c = this.cfg();
    const res = await this.http.send(`${c.baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: formBody({ client_id: c.clientId, client_secret: c.clientSecret, ...fields }),
    });
    if (res.status >= 500 || res.status === 429) throw new ProviderUnavailableError("GitLab không phản hồi", res.status);
    let body: { access_token?: string; refresh_token?: string; expires_in?: number; error?: string } = {};
    try {
      body = JSON.parse(res.body || "{}") as typeof body;
    } catch {
      throw new ProviderUnavailableError("Phản hồi của GitLab không phải JSON", res.status);
    }
    if (res.status >= 400 || !body.access_token) throw new ProviderAuthError("invalid_grant", "GitLab từ chối mã/refresh token");
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      expiresAt: typeof body.expires_in === "number" ? new Date(this.now() + body.expires_in * 1000) : null,
    };
  }

  async exchange(input: ExchangeInput): Promise<ExchangeResult> {
    if (!input.code) throw new ProviderAuthError("invalid_grant", "Thiếu mã uỷ quyền");
    const tokens = await this.token({ grant_type: "authorization_code", code: input.code, redirect_uri: input.redirectUri, code_verifier: input.codeVerifier });
    const me = await this.http.json<{ id?: number; username?: string }>(`${this.cfg().baseUrl}/api/v4/user`, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
    if (!me?.id || !me.username) throw new ProviderUnavailableError("GitLab không trả thông tin tài khoản");
    return { externalAccountId: String(me.id), externalName: me.username, tokens, scopes: ["api"] };
  }

  refresh(tokens: TokenSet): Promise<TokenSet> {
    if (!tokens.refreshToken) throw new ProviderAuthError("unauthorized", "Không có refresh token");
    return this.token({ grant_type: "refresh_token", refresh_token: tokens.refreshToken });
  }

  async revoke(ctx: ProviderCallContext): Promise<void> {
    const c = this.cfg();
    if (!ctx.tokens) return;
    await this.http.send(`${c.baseUrl}/oauth/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({ client_id: c.clientId, client_secret: c.clientSecret, token: ctx.tokens.accessToken }),
    });
  }

  async verifyWebhook(_rawBody: Buffer, headers: IncomingHttpHeaders, ctx: WebhookVerifyContext): Promise<WebhookVerification> {
    const provided = header(headers, "x-gitlab-token");
    if (!provided) return { ok: false };
    const hash = sha256(provided);
    const found = await ctx.findBySecretHash(hash);
    if (!found || found.webhookSecretHash.length !== hash.length) return { ok: false };
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(found.webhookSecretHash, "hex")) ? { ok: true, integrationId: found.id } : { ok: false };
  }

  parseWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): ParsedWebhook | null {
    let body: unknown;
    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return null;
    }
    const p = asRecord(body);
    const kind = typeof p?.object_kind === "string" ? p.object_kind : header(headers, "x-gitlab-event") ?? "";
    if (!p || !kind) return null;
    const project = asRecord(p.project);
    const projectId = project?.id ?? p.project_id;
    return {
      eventId: header(headers, "x-gitlab-event-uuid") ?? header(headers, "idempotency-key") ?? sha256(rawBody.toString("utf8")),
      eventType: KIND_TO_EVENT[kind] ?? kind,
      ...(projectId !== undefined ? { resourceId: String(projectId) } : {}),
      ...(typeof project?.path_with_namespace === "string" ? { resourceName: project.path_with_namespace } : {}),
      payload: payloadForStorage(p),
    };
  }

  mapEvent = (type: string, payload: Record<string, unknown>) => mapGitlabEvent(type, payload, this.hosts);

  async listResources(ctx: ProviderCallContext, query: { query?: string; page?: number }): Promise<ResourcePage> {
    if (!ctx.tokens) throw new ProviderAuthError("unauthorized", "Thiếu token");
    const q = new URLSearchParams({ membership: "true", min_access_level: "40", simple: "true", per_page: String(PAGE_SIZE), page: String(Math.max(1, query.page ?? 1)), order_by: "last_activity_at" });
    if (query.query) q.set("search", query.query);
    const rows = await this.http.json<unknown[]>(`${this.cfg().baseUrl}/api/v4/projects?${q.toString()}`, { headers: { Authorization: `Bearer ${ctx.tokens.accessToken}` } });
    const items = asArray(rows)
      .map(asRecord)
      .filter((r): r is Record<string, unknown> => r !== null && typeof r.id === "number" && typeof r.path_with_namespace === "string")
      .map((r) => ({ id: String(r.id), fullName: String(r.path_with_namespace) }));
    return { items, hasMore: items.length === PAGE_SIZE };
  }

  private hookBody(config: IntegrationConfig, endpoint: string, secret: string): URLSearchParams {
    const flags: Record<string, string> = {};
    for (const [event, flag] of Object.entries(EVENT_FLAGS)) flags[flag] = String(config.events.includes(event));
    return formBody({ url: endpoint, token: secret, enable_ssl_verification: "true", ...flags });
  }

  async syncHooks(ctx: ProviderCallContext, input: { config: IntegrationConfig; endpoint: string; secret: string }): Promise<string[]> {
    if (!ctx.tokens) throw new ProviderAuthError("unauthorized", "Thiếu token");
    const auth = { Authorization: `Bearer ${ctx.tokens.accessToken}`, "Content-Type": "application/x-www-form-urlencoded" };
    const base = this.cfg().baseUrl;
    const existing = new Map((ctx.externalHookIds ?? []).map(splitHookId).filter((h): h is { project: string; hook: string } => h !== null).map((h) => [h.project, h.hook]));
    const wanted = new Set(input.config.repos.map((r) => r.id));
    const result: string[] = [];
    for (const [project, hook] of existing) {
      if (!wanted.has(project)) await this.tolerateMissing(() => this.http.send(`${base}/api/v4/projects/${project}/hooks/${hook}`, { method: "DELETE", headers: auth }));
    }
    for (const project of wanted) {
      const body = this.hookBody(input.config, input.endpoint, input.secret);
      const hook = existing.get(project);
      let id: string | undefined;
      if (hook) {
        const res = await this.http.send(`${base}/api/v4/projects/${project}/hooks/${hook}`, { method: "PUT", headers: auth, body });
        if (res.status >= 200 && res.status < 300) id = hook;
        else if (res.status !== 404) throw new ProviderUnavailableError(`GitLab từ chối cập nhật hook (${res.status})`, res.status);
      }
      if (!id) {
        const created = await this.http.json<{ id?: number }>(`${base}/api/v4/projects/${project}/hooks`, { method: "POST", headers: auth, body });
        if (!created?.id) throw new ProviderUnavailableError("GitLab không trả id hook");
        id = String(created.id);
      }
      result.push(`${project}:${id}`);
    }
    return result;
  }

  async removeHooks(ctx: ProviderCallContext): Promise<void> {
    if (!ctx.tokens) return;
    const auth = { Authorization: `Bearer ${ctx.tokens.accessToken}` };
    for (const raw of ctx.externalHookIds ?? []) {
      const h = splitHookId(raw);
      if (h) await this.tolerateMissing(() => this.http.send(`${this.cfg().baseUrl}/api/v4/projects/${h.project}/hooks/${h.hook}`, { method: "DELETE", headers: auth }));
    }
  }

  async checkHealth(ctx: ProviderCallContext): Promise<"OK" | "HOOK_MISSING"> {
    if (!ctx.tokens) return "OK";
    for (const raw of ctx.externalHookIds ?? []) {
      const h = splitHookId(raw);
      if (!h) continue;
      const res = await this.http.send(`${this.cfg().baseUrl}/api/v4/projects/${h.project}/hooks/${h.hook}`, { headers: { Authorization: `Bearer ${ctx.tokens.accessToken}` } });
      if (res.status === 404) return "HOOK_MISSING";
    }
    return "OK";
  }

  private async tolerateMissing(run: () => Promise<{ status: number }>): Promise<void> {
    const res = await run();
    if (res.status >= 500) throw new ProviderUnavailableError(`GitLab lỗi ${res.status}`, res.status);
  }
}
