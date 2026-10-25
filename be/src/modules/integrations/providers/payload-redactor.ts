/**
 * Lọc payload webhook (p5-03): (1) `store` — trước khi ghi `WebhookEvent.payload` (bỏ email/secret/danh sách tệp cồng kềnh, cắt độ sâu/độ dài,
 * bỏ khoá `$…`/có `.` mà MongoDB không thích); (2) `display` — trước khi trả cho admin (che giá trị nhạy cảm thành `***`, che cả token/email
 * lẫn trong chuỗi). Hàm thuần, không đọc env.
 */
const SENSITIVE_KEY = /(token|secret|passcode|password|authorization|credential|private_key|email|ciphertext|signature)/i;
/** Khoá cồng kềnh không cần để dựng tin (danh sách tệp mỗi commit, diff). */
const BULKY_KEY = /^(added|removed|modified|diff|patch|files)$/;
const MAX_DEPTH = 10;
const MAX_ARRAY = 100;
const MAX_STRING = 4000;
const MASK = "***";

const TOKEN_LIKE = /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,})\b/g;
const EMAIL_LIKE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export type RedactMode = "store" | "display";

function badKey(key: string): boolean {
  return key.startsWith("$") || key.includes(".");
}

function cleanString(value: string, mode: RedactMode): string {
  const capped = value.length > MAX_STRING ? value.slice(0, MAX_STRING) : value;
  return mode === "display" ? capped.replace(TOKEN_LIKE, MASK).replace(EMAIL_LIKE, MASK) : capped;
}

function walk(value: unknown, mode: RedactMode, depth: number): unknown {
  if (typeof value === "string") return cleanString(value, mode);
  if (typeof value !== "object" || value === null) return value;
  if (depth >= MAX_DEPTH) return null;
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((v) => walk(v, mode, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (badKey(key)) continue;
    if (SENSITIVE_KEY.test(key)) {
      if (mode === "display") out[key] = MASK;
      continue;
    }
    if (mode === "store" && BULKY_KEY.test(key)) continue;
    out[key] = walk(val, mode, depth + 1);
  }
  return out;
}

export function redactPayload(value: unknown, mode: RedactMode): unknown {
  return walk(value, mode, 0);
}

/** Bản lưu DB: luôn là object (payload gốc không phải object → `{}`). */
export function payloadForStorage(value: unknown): Record<string, unknown> {
  const out = walk(value, "store", 0);
  return typeof out === "object" && out !== null && !Array.isArray(out) ? (out as Record<string, unknown>) : {};
}
