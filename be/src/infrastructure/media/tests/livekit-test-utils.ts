/**
 * Bộ dựng dùng chung cho test media (KHÔNG phải test): khoá LiveKit giả + hàm ký webhook đúng chuẩn LiveKit
 * (`Authorization` = JWT ký bằng API secret, claim `sha256` = base64(sha256(body)); xem `WebhookReceiver` của SDK).
 */
import { createHash } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";

export const TEST_LIVEKIT = {
  url: "http://livekit.test:7880",
  publicUrl: "wss://lk.test.example",
  apiKey: "APItestkey",
  apiSecret: "test-livekit-secret-that-is-long-enough-32b",
} as const;

/** Đặt env LiveKit TRƯỚC khi `core/config` được nạp lần đầu (đặt ở đầu file test). */
export function setLiveKitEnv(overrides: Record<string, string | undefined> = {}): void {
  const values: Record<string, string | undefined> = {
    LIVEKIT_URL: TEST_LIVEKIT.url,
    LIVEKIT_PUBLIC_URL: TEST_LIVEKIT.publicUrl,
    LIVEKIT_API_KEY: TEST_LIVEKIT.apiKey,
    LIVEKIT_API_SECRET: TEST_LIVEKIT.apiSecret,
    ...overrides,
  };
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

export function sha256Base64(body: string): string {
  return createHash("sha256").update(body).digest("base64");
}

/** JWT `Authorization` của webhook LiveKit cho `body`. `secret`/`key` mặc định là khoá test. */
export async function signWebhook(
  body: string,
  opts: { key?: string; secret?: string; ttl?: string | number } = {}
): Promise<string> {
  const at = new AccessToken(opts.key ?? TEST_LIVEKIT.apiKey, opts.secret ?? TEST_LIVEKIT.apiSecret, {
    ttl: opts.ttl ?? "5m",
  });
  at.sha256 = sha256Base64(body);
  return at.toJwt();
}

export interface WebhookBodyInput {
  id?: string;
  event?: string;
  room?: string;
  identity?: string;
  egress?: Record<string, unknown>;
  track?: Record<string, unknown>;
}

/** Thân webhook JSON đúng dạng LiveKit (proto JSON: id/event/room/participant/egressInfo/createdAt). */
export function webhookBody(i: WebhookBodyInput = {}): string {
  return JSON.stringify({
    event: i.event ?? "participant_joined",
    id: i.id ?? "EV_test0001",
    createdAt: String(Math.floor(Date.now() / 1000)),
    ...(i.room && { room: { sid: "RM_abc", name: i.room, numParticipants: 1 } }),
    ...(i.identity && { participant: { sid: "PA_abc", identity: i.identity, state: "ACTIVE", joinedAt: String(Math.floor(Date.now() / 1000)) } }),
    ...(i.track && { track: i.track }),
    ...(i.egress && { egressInfo: i.egress }),
  });
}

/** Decode payload JWT (không kiểm chữ ký) — để assert claim/grants. */
export function decodeJwtPayload(token: string): Record<string, unknown> & { video?: Record<string, unknown> } {
  return JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")) as Record<string, unknown> & { video?: Record<string, unknown> };
}
