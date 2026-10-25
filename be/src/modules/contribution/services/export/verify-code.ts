import { createHash, randomBytes } from "crypto";

/**
 * Mã xác thực + mã băm dữ liệu của PDF báo cáo (README p4-06 §2 "PDF", be.md §5.7) — HÀM THUẦN (trừ `generateVerifyCode` dùng CSPRNG).
 * Giảng viên đối chiếu: mã xác thực in ở chân mỗi trang khớp `ContributionExport.verifyCode`, `sha256` khớp `dataHash` (dữ liệu chuẩn hoá).
 */

/** JSON ổn định: khoá đối tượng sắp tăng dần, không khoảng trắng — cùng dữ liệu ⇒ cùng chuỗi bất kể thứ tự khoá. `undefined` bị bỏ như `JSON.stringify`. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(",")}}`;
}

export const sha256Hex = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

/** Băm dữ liệu chuẩn hoá — `dataHash`. */
export const hashCanonical = (value: unknown): string => sha256Hex(canonicalJson(value));

/** 31 ký tự dễ đọc: bỏ I, L, O (dễ nhầm với 1, 0) và chữ số 0, 1. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const VERIFY_CODE_LENGTH = 10;
export const VERIFY_CODE_RE = /^[A-HJKMNP-Z2-9]{10}$/;

/** Mã 10 ký tự ngẫu nhiên (~50 bit) từ bảng chữ cái 31 ký tự. */
export function generateVerifyCode(bytes: Buffer = randomBytes(VERIFY_CODE_LENGTH)): string {
  let code = "";
  for (let i = 0; i < VERIFY_CODE_LENGTH; i += 1) code += ALPHABET[bytes[i] % ALPHABET.length];
  return code;
}

/** "ABCDEFGHJK" → "ABCD-EFGH-JK" (dạng in ở chân trang). */
export const formatVerifyCode = (code: string): string => `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`;

/** sha256 rút gọn để in ở chân trang: "3f2a…9c". */
export const shortHash = (hash: string): string => `${hash.slice(0, 4)}…${hash.slice(-2)}`;
