import * as http2 from "node:http2";
import jwt from "jsonwebtoken";
import { logger } from "../logger";
import type { ApnsEnvironment, IVoipSender, VoipPayload, VoipSendResult } from "./push.types";

const SANDBOX_HOST = "https://api.sandbox.push.apple.com";
const PRODUCTION_HOST = "https://api.push.apple.com";
/** Provider token JWT hợp lệ tối đa 1h theo Apple — cache 50 phút để chừa biên an toàn. */
const JWT_TTL_MS = 50 * 60 * 1000;
const PING_INTERVAL_MS = 60_000;
/** `apns-expiration` — VoIP hết hạn sau 60s nếu chưa gửi được (be.md §5.6/§9 `voipTtlSeconds`); ngắn hơn nếu `payload.expiresAt` (hạn đổ chuông) tới sớm hơn. */
const EXPIRATION_SECONDS = 60;

/** Epoch giây của `apns-expiration` = `min(now + 60 s, payload.expiresAt)` (p2-02 be.md §5.1); `expiresAt` thiếu/sai định dạng ⇒ `now + 60 s` như trước. Không bao giờ < now (0 nghĩa "gửi một lần, không lưu" — vẫn hợp lệ với chuông đã quá hạn). */
export function voipExpirationEpoch(payload: Pick<VoipPayload, "expiresAt">, nowMs: number = Date.now()): number {
  const cap = Math.floor(nowMs / 1000) + EXPIRATION_SECONDS;
  const expiresMs = payload.expiresAt ? Date.parse(payload.expiresAt) : NaN;
  if (!Number.isFinite(expiresMs)) return cap;
  return Math.min(cap, Math.max(0, Math.floor(expiresMs / 1000)));
}

export interface ApnsVoipSenderConfig {
  keyId: string;
  teamId: string;
  /** Nội dung `.p8` (PEM) — KHÔNG phải đường dẫn, `push.factory.ts` tự đọc file trước khi truyền vào đây. */
  privateKey: string;
  /** Chỉ dùng trong test — ghi đè host thật để trỏ vào server http2 giả cục bộ. */
  sandboxHost?: string;
  productionHost?: string;
}

interface PendingResponse {
  status: number;
  body: string;
}

/**
 * HTTP/2 client tới APNs (be.md §5.6) — JWT ES256 ký bằng `jsonwebtoken` (đã
 * có sẵn dependency, tự sinh chữ ký JOSE R||S đúng chuẩn, không cần tự gọi
 * `crypto.sign` tay). Tái sử dụng 1 session HTTP/2 mỗi môi trường
 * (sandbox/production), ping mỗi 60s, tự mở lại khi `goaway`/`close`.
 */
export class ApnsVoipPushSender implements IVoipSender {
  private readonly sessions = new Map<ApnsEnvironment, http2.ClientHttp2Session>();
  private readonly pingTimers = new Map<ApnsEnvironment, NodeJS.Timeout>();
  private cachedToken: { token: string; createdAt: number } | null = null;

  constructor(private readonly config: ApnsVoipSenderConfig) {}

  async send(
    token: string,
    environment: ApnsEnvironment,
    bundleId: string,
    payload: VoipPayload
  ): Promise<VoipSendResult> {
    try {
      return await this.doSend(token, environment, bundleId, payload, false);
    } catch (err) {
      logger.warn("[push] Gửi APNs VoIP lỗi kết nối — job sẽ retry", {
        error: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, status: 0, shouldRevoke: false, retriable: true, reason: "CONNECTION_ERROR" };
    }
  }

  private async doSend(
    token: string,
    environment: ApnsEnvironment,
    bundleId: string,
    payload: VoipPayload,
    isRetry: boolean
  ): Promise<VoipSendResult> {
    const session = this.getSession(environment);
    const jwtToken = this.getProviderToken(isRetry);
    const body = JSON.stringify(payload);

    const res = await this.request(session, {
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${jwtToken}`,
      "apns-topic": `${bundleId}.voip`,
      "apns-push-type": "voip",
      "apns-priority": "10",
      "apns-expiration": String(voipExpirationEpoch(payload)),
      "apns-id": payload.callUuid,
    }, body);

    if (res.status === 200) return { ok: true, status: 200, shouldRevoke: false, retriable: false };

    const reason = safeParseReason(res.body);

    if (res.status === 403 && reason === "InvalidProviderToken" && !isRetry) {
      this.cachedToken = null; // buộc sinh JWT mới
      return this.doSend(token, environment, bundleId, payload, true);
    }
    if (res.status === 410 || (res.status === 400 && (reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic"))) {
      return { ok: false, status: res.status, shouldRevoke: true, retriable: false, reason };
    }
    if (res.status === 429 || res.status >= 500) {
      return { ok: false, status: res.status, shouldRevoke: false, retriable: true, reason };
    }
    return { ok: false, status: res.status, shouldRevoke: false, retriable: false, reason };
  }

  private request(
    session: http2.ClientHttp2Session,
    headers: http2.OutgoingHttpHeaders,
    body: string
  ): Promise<PendingResponse> {
    return new Promise((resolve, reject) => {
      const req = session.request(headers);
      let status = 0;
      let responseBody = "";
      req.on("response", (h) => {
        status = Number(h[":status"] ?? 0);
      });
      req.setEncoding("utf-8");
      req.on("data", (chunk) => {
        responseBody += chunk;
      });
      req.on("end", () => resolve({ status, body: responseBody }));
      req.on("error", reject);
      req.end(body);
    });
  }

  /** Tái sử dụng session HTTP/2 theo môi trường — tự mở lại khi đã đóng (`goaway`/`close`/lỗi). */
  private getSession(environment: ApnsEnvironment): http2.ClientHttp2Session {
    const existing = this.sessions.get(environment);
    if (existing && !existing.closed && !existing.destroyed) return existing;

    const authority =
      environment === "SANDBOX"
        ? this.config.sandboxHost ?? SANDBOX_HOST
        : this.config.productionHost ?? PRODUCTION_HOST;
    const session = http2.connect(authority);
    session.on("error", (err) => {
      logger.warn("[push] Phiên HTTP/2 APNs lỗi — sẽ mở lại ở lượt gửi tiếp theo", {
        environment,
        error: err.message,
      });
      this.dropSession(environment);
    });
    session.on("goaway", () => this.dropSession(environment));
    session.on("close", () => this.dropSession(environment));

    const timer = setInterval(() => {
      if (!session.destroyed) session.ping(() => undefined);
    }, PING_INTERVAL_MS);
    timer.unref();
    this.pingTimers.set(environment, timer);
    this.sessions.set(environment, session);
    return session;
  }

  private dropSession(environment: ApnsEnvironment): void {
    this.sessions.delete(environment);
    const timer = this.pingTimers.get(environment);
    if (timer) {
      clearInterval(timer);
      this.pingTimers.delete(environment);
    }
  }

  /** JWT `{alg:ES256, kid}` / `{iss, iat}` — cache 50 phút, `forceRefresh` dùng khi APNs báo 403 `InvalidProviderToken`. */
  private getProviderToken(forceRefresh: boolean): string {
    const now = Date.now();
    if (!forceRefresh && this.cachedToken && now - this.cachedToken.createdAt < JWT_TTL_MS) {
      return this.cachedToken.token;
    }
    const token = jwt.sign(
      { iss: this.config.teamId, iat: Math.floor(now / 1000) },
      this.config.privateKey,
      { algorithm: "ES256", header: { alg: "ES256", kid: this.config.keyId } }
    );
    this.cachedToken = { token, createdAt: now };
    return token;
  }

  /** Chỉ dùng trong test — đóng mọi session đang mở để Jest không treo vì handle HTTP/2 còn sống. */
  closeAll(): void {
    const openSessions = [...this.sessions.entries()];
    for (const [environment] of openSessions) this.dropSession(environment);
    for (const [, session] of openSessions) session.close();
  }
}

function safeParseReason(body: string): string | undefined {
  try {
    return (JSON.parse(body) as { reason?: string }).reason;
  } catch {
    return undefined;
  }
}
