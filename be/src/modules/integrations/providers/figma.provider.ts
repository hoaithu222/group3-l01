import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { env } from "../../../core/config";
import { isIntegrationProviderConfigured } from "../../../core/config/integration-env";
import type { IntegrationConfig } from "../entities/integration.interface";
import { FIGMA_FILE_KEY, mapFigmaEvent, parseFigmaFileKey } from "./event-mappers/figma.mapper";
import { asRecord } from "./event-mappers/mapper-utils";
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

export const FIGMA_HOSTS = ["api.figma.com", "www.figma.com"] as const;
const API = "https://api.figma.com";
/** Phạm vi cần: đọc người dùng/tệp + quản lý webhook (kiểm lại tên phạm vi khi đăng ký ứng dụng Figma). */
const SCOPES = ["current_user:read", "file_content:read", "webhooks:write"];
const sha256 = (v: string): string => createHash("sha256").update(v).digest("hex");

export interface FigmaConfig {
  clientId: string;
  clientSecret: string;
}

export function figmaConfigFromEnv(): FigmaConfig {
  return { clientId: env.FIGMA_CLIENT_ID ?? "", clientSecret: env.FIGMA_CLIENT_SECRET ?? "" };
}

/** `<fileKey>:<eventType>:<hookId>` — mỗi (file, loại sự kiện) một webhook v2. */
function splitHookId(raw: string): { file: string; event: string; hook: string } | null {
  const [file, event, hook] = raw.split(":");
  return file && event && hook ? { file, event, hook } : null;
}

/**
 * Figma (P1): OAuth2 (token 90 ngày + refresh) và webhook v2 theo TỪNG FILE (`FILE_UPDATE`, `FILE_COMMENT`). Xác thực webhook bằng `passcode` (secret riêng từng kết nối,
 * lưu sha256 + bản mã hoá) so sánh hằng thời gian. Người dùng chỉ nhập KHOÁ file/liên kết `figma.com` — server trích khoá rồi gọi `api.figma.com` cố định (không SSRF).
 */
export class FigmaProvider implements IntegrationProvider {
  readonly provider = "FIGMA" as const;
  readonly kind = "WORKSPACE" as const;

  constructor(
    private readonly http: ProviderHttp,
    private readonly cfg: () => FigmaConfig = figmaConfigFromEnv,
    private readonly now: () => number = Date.now
  ) {}

  isConfigured(): boolean {
    return isIntegrationProviderConfigured("FIGMA");
  }

  authorizeUrl(input: AuthorizeInput): string {
    const q = new URLSearchParams({ client_id: this.cfg().clientId, redirect_uri: input.redirectUri, scope: SCOPES.join(" "), state: input.state, response_type: "code" });
    return `https://www.figma.com/oauth?${q.toString()}`;
  }

  private async token(path: string, fields: Record<string, string>): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number; userId?: string }> {
    const c = this.cfg();
    const basic = Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64");
    const res = await this.http.send(`${API}${path}`, { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }, body: formBody(fields) });
    if (res.status >= 500 || res.status === 429) throw new ProviderUnavailableError("Figma không phản hồi", res.status);
    let body: { access_token?: string; refresh_token?: string; expires_in?: number; user_id?: string | number } = {};
    try {
      body = JSON.parse(res.body || "{}") as typeof body;
    } catch {
      throw new ProviderUnavailableError("Phản hồi của Figma không phải JSON", res.status);
    }
    if (res.status >= 400 || !body.access_token) throw new ProviderAuthError("invalid_grant", "Figma từ chối mã/refresh token");
    return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresIn: body.expires_in, userId: body.user_id !== undefined ? String(body.user_id) : undefined };
  }

  async exchange(input: ExchangeInput): Promise<ExchangeResult> {
    if (!input.code) throw new ProviderAuthError("invalid_grant", "Thiếu mã uỷ quyền");
    const t = await this.token("/v1/oauth/token", { redirect_uri: input.redirectUri, code: input.code, grant_type: "authorization_code" });
    const me = await this.http.json<{ id?: string; handle?: string }>(`${API}/v1/me`, { headers: { Authorization: `Bearer ${t.accessToken}` } });
    const id = me?.id ?? t.userId;
    if (!id) throw new ProviderUnavailableError("Figma không trả thông tin tài khoản");
    const tokens: TokenSet = { accessToken: t.accessToken, refreshToken: t.refreshToken ?? null, expiresAt: t.expiresIn ? new Date(this.now() + t.expiresIn * 1000) : null };
    return { externalAccountId: String(id), externalName: me?.handle ?? String(id), tokens, scopes: SCOPES };
  }

  async refresh(tokens: TokenSet): Promise<TokenSet> {
    if (!tokens.refreshToken) throw new ProviderAuthError("unauthorized", "Không có refresh token");
    const t = await this.token("/v1/oauth/refresh", { refresh_token: tokens.refreshToken });
    // Figma giữ nguyên refresh token khi làm mới access token.
    return { accessToken: t.accessToken, refreshToken: t.refreshToken ?? tokens.refreshToken, expiresAt: t.expiresIn ? new Date(this.now() + t.expiresIn * 1000) : null };
  }

  async verifyWebhook(rawBody: Buffer, _headers: IncomingHttpHeaders, ctx: WebhookVerifyContext): Promise<WebhookVerification> {
    let passcode: unknown;
    try {
      passcode = asRecord(JSON.parse(rawBody.toString("utf8")))?.passcode;
    } catch {
      return { ok: false };
    }
    if (typeof passcode !== "string" || passcode.length === 0 || passcode.length > 200) return { ok: false };
    const hash = sha256(passcode);
    const found = await ctx.findBySecretHash(hash);
    if (!found || found.webhookSecretHash.length !== hash.length) return { ok: false };
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(found.webhookSecretHash, "hex")) ? { ok: true, integrationId: found.id } : { ok: false };
  }

  parseWebhook(rawBody: Buffer): ParsedWebhook | null {
    let body: unknown;
    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return null;
    }
    const p = asRecord(body);
    if (!p || typeof p.event_type !== "string") return null;
    return {
      // Figma không cấp id giao hàng: lần gửi lại có body y hệt (cùng `timestamp`) nên hash body là khoá dedupe ổn định.
      eventId: `figma_${sha256(rawBody.toString("utf8")).slice(0, 40)}`,
      eventType: p.event_type,
      ...(typeof p.file_key === "string" ? { resourceId: p.file_key } : {}),
      ...(typeof p.file_name === "string" ? { resourceName: p.file_name } : {}),
      payload: payloadForStorage(p), // `passcode` (secret của ta) bị loại vì khoá nhạy cảm
    };
  }

  mapEvent = mapFigmaEvent;

  /** Figma không có API "liệt kê mọi file": `query` là LIÊN KẾT/khoá file người dùng dán → kiểm ở Figma và trả đúng 1 mục (tên file). */
  async listResources(ctx: ProviderCallContext, query: { query?: string }): Promise<ResourcePage> {
    const key = query.query ? parseFigmaFileKey(query.query) : null;
    if (!key || !ctx.tokens) return { items: [], hasMore: false };
    const file = await this.http.json<{ name?: string }>(`${API}/v1/files/${key}?depth=1`, { headers: { Authorization: `Bearer ${ctx.tokens.accessToken}` } });
    return { items: [{ id: key, fullName: file?.name ?? key }], hasMore: false };
  }

  async syncHooks(ctx: ProviderCallContext, input: { config: IntegrationConfig; endpoint: string; secret: string }): Promise<string[]> {
    if (!ctx.tokens) throw new ProviderAuthError("unauthorized", "Thiếu token");
    const auth = { Authorization: `Bearer ${ctx.tokens.accessToken}`, "Content-Type": "application/json" };
    const events = input.config.events.filter((e) => e === "FILE_UPDATE" || e === "FILE_COMMENT");
    const wanted = new Set(input.config.repos.filter((r) => FIGMA_FILE_KEY.test(r.id)).flatMap((r) => events.map((e) => `${r.id}:${e}`)));
    const kept: string[] = [];
    const have = new Set<string>();
    for (const raw of ctx.externalHookIds ?? []) {
      const h = splitHookId(raw);
      if (!h) continue;
      const slot = `${h.file}:${h.event}`;
      if (wanted.has(slot) && !have.has(slot)) {
        kept.push(raw);
        have.add(slot);
      } else {
        const res = await this.http.send(`${API}/v2/webhooks/${h.hook}`, { method: "DELETE", headers: auth });
        if (res.status >= 500) throw new ProviderUnavailableError(`Figma lỗi ${res.status}`, res.status);
      }
    }
    for (const slot of wanted) {
      if (have.has(slot)) continue;
      const [file, event] = slot.split(":") as [string, string];
      const created = await this.http.json<{ id?: string }>(`${API}/v2/webhooks`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ event_type: event, context: "file", context_id: file, endpoint: input.endpoint, passcode: input.secret, description: "Super App" }),
      });
      if (!created?.id) throw new ProviderUnavailableError("Figma không trả id webhook");
      kept.push(`${file}:${event}:${created.id}`);
    }
    return kept;
  }

  async removeHooks(ctx: ProviderCallContext): Promise<void> {
    if (!ctx.tokens) return;
    for (const raw of ctx.externalHookIds ?? []) {
      const h = splitHookId(raw);
      if (h) await this.http.send(`${API}/v2/webhooks/${h.hook}`, { method: "DELETE", headers: { Authorization: `Bearer ${ctx.tokens.accessToken}` } });
    }
  }

  async checkHealth(ctx: ProviderCallContext): Promise<"OK" | "HOOK_MISSING"> {
    if (!ctx.tokens) return "OK";
    for (const raw of ctx.externalHookIds ?? []) {
      const h = splitHookId(raw);
      if (!h) continue;
      const res = await this.http.send(`${API}/v2/webhooks/${h.hook}`, { headers: { Authorization: `Bearer ${ctx.tokens.accessToken}` } });
      if (res.status === 404) return "HOOK_MISSING";
    }
    return "OK";
  }
}
