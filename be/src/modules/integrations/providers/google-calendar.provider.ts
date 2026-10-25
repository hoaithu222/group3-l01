import { createHash } from "node:crypto";
import { env } from "../../../core/config";
import { isIntegrationProviderConfigured } from "../../../core/config/integration-env";
import { formBody, ProviderHttp, classifyFailure, type HttpResult } from "./provider-http";
import {
  ProviderAuthError,
  ProviderUnavailableError,
  type AuthorizeInput,
  type ExchangeInput,
  type ExchangeResult,
  type IntegrationProvider,
  type ProviderCallContext,
  type TokenSet,
} from "./provider.interface";

export const GOOGLE_HOSTS = ["accounts.google.com", "oauth2.googleapis.com", "www.googleapis.com"] as const;
const CALENDAR_API = "https://www.googleapis.com/calendar/v3/calendars";
/** `calendar.events` (README §10) + `openid email` để biết tài khoản Google đang nối. */
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"];

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

export function googleConfigFromEnv(): GoogleConfig {
  return { clientId: env.GOOGLE_CLIENT_ID ?? "", clientSecret: env.GOOGLE_CLIENT_SECRET ?? "" };
}

export interface CalendarEventInput {
  meetingId: string;
  userId: string;
  title: string;
  description: string;
  location?: string;
  startAt: Date;
  endAt: Date;
  /** IANA — hiển thị đúng múi giờ của cuộc họp. */
  timezone: string;
  /** Liên kết mở cuộc họp trong Super App. */
  url: string;
}

export interface CalendarEventRef {
  externalEventId: string;
  etag: string | null;
}

/** Ghi sự kiện lên lịch ngoài (một chiều, README §1 P0). Cài đặt thật là Google; test dùng đồ giả. */
export interface ICalendarClient {
  upsertEvent(tokens: TokenSet, calendarId: string, input: CalendarEventInput, existing: CalendarEventRef | null): Promise<CalendarEventRef>;
  /** Xoá sự kiện; đã không còn (404/410) coi như thành công. */
  deleteEvent(tokens: TokenSet, calendarId: string, externalEventId: string): Promise<void>;
}

/** Id sự kiện tất định theo (cuộc họp, người): Google chấp nhận id tự đặt gồm `[a-v0-9]` (hex ⊂ đó) → chèn lặp không tạo hai sự kiện (409 ⇒ cập nhật). */
export function calendarEventId(meetingId: string, userId: string): string {
  return createHash("sha1").update(`${meetingId}:${userId}`).digest("hex");
}

/** Lấy `email` (và kiểm `aud`) từ `id_token` nhận trực tiếp từ token endpoint của Google qua TLS — không cần kiểm chữ ký lại. */
export function emailFromIdToken(idToken: string | undefined, clientId: string): string | null {
  const part = idToken?.split(".")[1];
  if (!part) return null;
  try {
    const claims = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { email?: unknown; aud?: unknown };
    if (claims.aud !== clientId || typeof claims.email !== "string") return null;
    return claims.email;
  } catch {
    return null;
  }
}

/** Google trả 403 cho cả "hết hạn mức" (thử lại được) lẫn "thiếu quyền" — phân biệt bằng `reason` trong body. */
function googleFailure(res: HttpResult): Error {
  if (res.status === 403 && /rateLimitExceeded|userRateLimitExceeded|quotaExceeded|backendError/.test(res.body)) return new ProviderUnavailableError("Google giới hạn tốc độ", res.status);
  return classifyFailure(res);
}

/** Google Calendar cá nhân (P0): OAuth2 + PKCE, đẩy MỘT CHIỀU tạo/sửa/xoá sự kiện họp. Mọi gọi ra chỉ tới host Google. Token làm mới bởi `TokenService`. */
export class GoogleCalendarProvider implements IntegrationProvider, ICalendarClient {
  readonly provider = "GOOGLE_CALENDAR" as const;
  readonly kind = "USER" as const;
  readonly usesPkce = true;

  constructor(
    private readonly http: ProviderHttp,
    private readonly cfg: () => GoogleConfig = googleConfigFromEnv,
    private readonly now: () => number = Date.now
  ) {}

  isConfigured(): boolean {
    return isIntegrationProviderConfigured("GOOGLE_CALENDAR");
  }

  authorizeUrl(input: AuthorizeInput): string {
    const q = new URLSearchParams({
      client_id: this.cfg().clientId,
      redirect_uri: input.redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state: input.state,
    });
    if (input.codeChallenge) {
      q.set("code_challenge", input.codeChallenge);
      q.set("code_challenge_method", "S256");
    }
    return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
  }

  private async token(fields: Record<string, string | undefined>): Promise<{ tokens: TokenSet; idToken?: string; scope?: string }> {
    const c = this.cfg();
    const res = await this.http.send("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({ client_id: c.clientId, client_secret: c.clientSecret, ...fields }),
    });
    if (res.status >= 500 || res.status === 429) throw new ProviderUnavailableError("Google không phản hồi", res.status);
    let body: { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; scope?: string; error?: string } = {};
    try {
      body = JSON.parse(res.body || "{}") as typeof body;
    } catch {
      throw new ProviderUnavailableError("Phản hồi của Google không phải JSON", res.status);
    }
    if (res.status >= 400 || !body.access_token) throw new ProviderAuthError("invalid_grant", body.error ?? "Google từ chối mã/refresh token");
    return {
      tokens: {
        accessToken: body.access_token,
        refreshToken: body.refresh_token ?? null,
        expiresAt: typeof body.expires_in === "number" ? new Date(this.now() + body.expires_in * 1000) : null,
      },
      idToken: body.id_token,
      scope: body.scope,
    };
  }

  async exchange(input: ExchangeInput): Promise<ExchangeResult> {
    if (!input.code) throw new ProviderAuthError("invalid_grant", "Thiếu mã uỷ quyền");
    const { tokens, idToken, scope } = await this.token({ grant_type: "authorization_code", code: input.code, redirect_uri: input.redirectUri, code_verifier: input.codeVerifier });
    if (!tokens.refreshToken) throw new ProviderAuthError("invalid_grant", "Google không cấp refresh token (hãy cấp lại quyền)");
    const email = emailFromIdToken(idToken, this.cfg().clientId);
    if (!email) throw new ProviderUnavailableError("Google không trả email tài khoản");
    if (!scope?.includes("calendar.events")) throw new ProviderAuthError("forbidden", "Chưa cấp quyền lịch");
    return { externalAccountId: email, externalName: email, tokens, scopes: scope.split(" ") };
  }

  async refresh(tokens: TokenSet): Promise<TokenSet> {
    if (!tokens.refreshToken) throw new ProviderAuthError("unauthorized", "Không có refresh token");
    const { tokens: next } = await this.token({ grant_type: "refresh_token", refresh_token: tokens.refreshToken });
    // Google không cấp lại refresh token khi làm mới — giữ bản cũ.
    return { ...next, refreshToken: next.refreshToken ?? tokens.refreshToken };
  }

  async revoke(ctx: ProviderCallContext): Promise<void> {
    const token = ctx.tokens?.refreshToken ?? ctx.tokens?.accessToken;
    if (!token) return;
    await this.http.send("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ token }) });
  }

  // ── Calendar (một chiều) ────────────────────────────────────────────────────

  private eventBody(input: CalendarEventInput, id?: string): string {
    return JSON.stringify({
      ...(id ? { id } : {}),
      status: "confirmed",
      summary: input.title,
      description: input.description,
      ...(input.location ? { location: input.location } : {}),
      start: { dateTime: input.startAt.toISOString(), timeZone: input.timezone },
      end: { dateTime: input.endAt.toISOString(), timeZone: input.timezone },
      extendedProperties: { private: { superappMeetingId: input.meetingId } },
      source: { title: "Super App", url: input.url },
    });
  }

  private eventUrl(calendarId: string, eventId?: string): string {
    return `${CALENDAR_API}/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ""}?sendUpdates=none`;
  }

  private async call(tokens: TokenSet, url: string, init: RequestInit & { ifMatch?: string | null }): Promise<HttpResult> {
    const headers: Record<string, string> = { Authorization: `Bearer ${tokens.accessToken}`, "Content-Type": "application/json" };
    if (init.ifMatch) headers["If-Match"] = init.ifMatch;
    return this.http.send(url, { method: init.method, body: init.body, headers });
  }

  private parseRef(res: HttpResult): CalendarEventRef {
    const body = JSON.parse(res.body || "{}") as { id?: string; etag?: string };
    if (!body.id) throw new ProviderUnavailableError("Google không trả id sự kiện", res.status);
    return { externalEventId: body.id, etag: body.etag ?? null };
  }

  async upsertEvent(tokens: TokenSet, calendarId: string, input: CalendarEventInput, existing: CalendarEventRef | null): Promise<CalendarEventRef> {
    const id = existing?.externalEventId ?? calendarEventId(input.meetingId, input.userId);
    const patch = async (ifMatch?: string | null): Promise<HttpResult> => this.call(tokens, this.eventUrl(calendarId, id), { method: "PATCH", body: this.eventBody(input), ifMatch });
    const ok = (r: HttpResult): boolean => r.status >= 200 && r.status < 300;

    if (existing) {
      let res = await patch(existing.etag);
      if (res.status === 412) res = await patch(null); // người dùng đã sửa sự kiện bên Google — bản của Super App ghi đè (một chiều)
      if (ok(res)) return this.parseRef(res);
      if (res.status !== 404 && res.status !== 410) throw googleFailure(res);
      // Sự kiện đã bị xoá hẳn phía Google — chèn lại bên dưới.
    }
    const created = await this.call(tokens, this.eventUrl(calendarId), { method: "POST", body: this.eventBody(input, id) });
    if (ok(created)) return this.parseRef(created);
    if (created.status === 409) {
      // Id đã tồn tại (chèn lặp, hoặc sự kiện từng bị xoá còn giữ chỗ) → cập nhật/khôi phục.
      const res = await patch(null);
      if (ok(res)) return this.parseRef(res);
      throw googleFailure(res);
    }
    throw googleFailure(created);
  }

  async deleteEvent(tokens: TokenSet, calendarId: string, externalEventId: string): Promise<void> {
    const res = await this.call(tokens, this.eventUrl(calendarId, externalEventId), { method: "DELETE" });
    if ((res.status >= 200 && res.status < 300) || res.status === 404 || res.status === 410) return;
    throw googleFailure(res);
  }
}
