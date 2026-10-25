import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { INTEGRATION_PROVIDERS, type IntegrationProviderValue } from "../../../core/constants/integration";
import { LIMITS } from "../../../core/constants/limits";
import { OneTimeStore } from "../../../core/utils/one-time-store";

/** Dữ kiện gắn với một phiên kết nối OAuth (`oauth:state:{nonce}`, TTL 10 phút). */
export interface OAuthStatePayload {
  userId: string;
  workspaceId?: string;
  provider: IntegrationProviderValue;
  returnTo: "app" | "admin";
  /** PKCE (S256): verifier giữ phía server, chỉ gửi `code_challenge` cho nhà cung cấp. */
  codeVerifier?: string;
}

const payloadSchema = z.object({
  userId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  provider: z.enum(INTEGRATION_PROVIDERS),
  returnTo: z.enum(["app", "admin"]),
  codeVerifier: z.string().min(1).optional(),
});

/** `code_challenge = base64url(sha256(verifier))`. */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function newCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Kho `state` OAuth DÙNG MỘT LẦN (chống CSRF/replay, README §2): Redis `SET … EX` + `GETDEL` nguyên tử (`OneTimeStore` — hai callback đồng thời không thể cùng
 * tiêu thụ một state); production mất Redis → `issue` ném 503, `consume` trả `null` (KHÔNG mở cửa). `state` dùng lại/hết hạn/không tồn tại → `null` (→ `INT_003`).
 */
export class OAuthStateStore {
  private readonly store: OneTimeStore;

  constructor(ttlSeconds: number = LIMITS.integration.oauthStateTtlSeconds, store?: OneTimeStore) {
    this.store = store ?? new OneTimeStore({ prefix: "oauth:state:", ttlSeconds, label: "oauth-state" });
  }

  /** Cấp `state` mới (32 byte ngẫu nhiên, base64url — không đoán được). */
  async issue(payload: OAuthStatePayload): Promise<string> {
    const nonce = randomBytes(32).toString("base64url");
    await this.store.put(nonce, payload);
    return nonce;
  }

  /** Lấy VÀ xoá `state`; trả `null` nếu lạ/đã dùng/hết hạn/hỏng dữ liệu. */
  async consume(nonce: string): Promise<OAuthStatePayload | null> {
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) return null;
    const raw = await this.store.take<unknown>(nonce);
    if (raw === null) return null;
    const parsed = payloadSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }
}
