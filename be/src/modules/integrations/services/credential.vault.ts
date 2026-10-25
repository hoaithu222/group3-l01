import { createHash, randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, type SealedSecret } from "../../../core/utils/crypto";
import type { StoredCredentials } from "../providers/provider.interface";

/**
 * Niêm phong/mở token tích hợp (p5-03): cả khối `{ accessToken, refreshToken, webhookSecret }` được mã hoá AES-256-GCM (`core/utils/crypto`, có `keyVersion`)
 * thành `{ ciphertext, iv, tag, keyVersion }` lưu cột JSON. ❌ KHÔNG log kết quả `openCredentials`, KHÔNG đưa vào DTO/thông điệp lỗi.
 */
export function sealCredentials(credentials: StoredCredentials): SealedSecret {
  return encryptSecret(JSON.stringify(credentials));
}

/** `null` → `null`. Dữ liệu hỏng/sai khoá → ném lỗi chung (không lộ nội dung). */
export function openCredentials(sealed: SealedSecret | null): StoredCredentials | null {
  if (!sealed) return null;
  try {
    const parsed = JSON.parse(decryptSecret(sealed)) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as StoredCredentials) : null;
  } catch {
    throw new Error("Không đọc được thông tin xác thực đã lưu (khoá mã hoá đã đổi hoặc dữ liệu hỏng)");
  }
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Secret webhook ngẫu nhiên (GitLab `X-Gitlab-Token`, Figma `passcode`) — ≥ 32 ký tự, không đoán được. */
export function newWebhookSecret(): string {
  return randomBytes(24).toString("base64url");
}
