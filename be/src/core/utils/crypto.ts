import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { env } from "../config";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function loadKey(): Buffer {
  const key = Buffer.from(env.ENCRYPTION_KEY, "hex");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY phải là 32 byte hex");
  return key;
}

/**
 * Mã hoá chuỗi nhạy cảm (số tài khoản ngân hàng — p6-04) bằng AES-256-GCM với
 * `ENCRYPTION_KEY`. Đầu ra `base64(iv | authTag | ciphertext)`, mỗi lần gọi dùng
 * IV ngẫu nhiên mới nên cùng plaintext cho ra chuỗi khác nhau.
 */
export function encryptAesGcm(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, loadKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

/** Giải mã chuỗi do `encryptAesGcm` tạo. Ném lỗi nếu dữ liệu bị sửa (sai auth tag) hoặc sai khoá. */
export function decryptAesGcm(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  if (raw.length <= IV_BYTES + TAG_BYTES) throw new Error("Dữ liệu mã hoá không hợp lệ");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const data = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, loadKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// (p5-03) Bí mật lưu dạng OBJECT có `keyVersion` — token tích hợp (OAuth access/refresh, khoá API)
// ─────────────────────────────────────────────────────────────────────────────

/** Phiên bản khoá đang dùng để MÃ HOÁ. Đổi khoá = thêm nhánh cho phiên bản mới ở `keyForVersion` (bản cũ vẫn giải mã được) rồi tăng số này. */
export const CURRENT_KEY_VERSION = 1;

/**
 * Bí mật đã mã hoá, lưu nguyên vào cột JSON (`Integration.credentials`, `UserIntegration.credentials`). Mỗi trường là base64;
 * `keyVersion` cho phép xoay khoá `ENCRYPTION_KEY` mà không mất khả năng giải mã dữ liệu cũ. ❌ KHÔNG log/trả qua API.
 */
export interface SealedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: number;
}

function keyForVersion(version: number): Buffer {
  if (version === 1) return loadKey();
  throw new Error(`keyVersion ${String(version)} không được hỗ trợ`);
}

/** Kiểm tra giá trị đọc từ DB/JSON có đúng hình `SealedSecret` không (không giải mã). */
export function isSealedSecret(value: unknown): value is SealedSecret {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.ciphertext === "string" &&
    typeof v.iv === "string" &&
    typeof v.tag === "string" &&
    typeof v.keyVersion === "number"
  );
}

/** Mã hoá `plain` (AES-256-GCM, IV ngẫu nhiên mỗi lần) → `{ ciphertext, iv, tag, keyVersion }`. Bổ sung, KHÔNG thay `encryptAesGcm` (chuỗi phẳng, p6-04). */
export function encryptSecret(plain: string): SealedSecret {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, keyForVersion(CURRENT_KEY_VERSION), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    keyVersion: CURRENT_KEY_VERSION,
  };
}

/** Giải mã bí mật do `encryptSecret` tạo theo đúng `keyVersion` đã lưu. Sai hình/keyVersion lạ/dữ liệu bị sửa → ném lỗi (không trả rác). */
export function decryptSecret(sealed: unknown): string {
  if (!isSealedSecret(sealed)) throw new Error("Dữ liệu mã hoá không hợp lệ");
  const iv = Buffer.from(sealed.iv, "base64");
  const tag = Buffer.from(sealed.tag, "base64");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error("Dữ liệu mã hoá không hợp lệ");
  const decipher = createDecipheriv(ALGORITHM, keyForVersion(sealed.keyVersion), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// (p6-05) HMAC-SHA256 bằng `ENCRYPTION_KEY` — băm bí mật ngắn không lưu thô (PIN nhận hàng O2O)
// ─────────────────────────────────────────────────────────────────────────────

/** `hex(HMAC-SHA256(ENCRYPTION_KEY, message))`. Dùng cho mã ngắn cần so khớp lại (PIN), KHÔNG dùng cho mật khẩu (bcrypt). */
export function hmacSha256Hex(message: string): string {
  return createHmac("sha256", loadKey()).update(message, "utf8").digest("hex");
}

/** So sánh hai chuỗi hex bằng thời gian hằng (chống dò theo thời gian phản hồi); khác độ dài → `false`. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
