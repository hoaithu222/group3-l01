/**
 * Tiện ích thuần cho mapper sự kiện (GitHub/GitLab/Figma → nội dung tin hệ thống). MỌI chuỗi từ webhook là dữ liệu NGƯỜI NGOÀI nhập
 * (tên commit, tiêu đề PR, bình luận) — luôn làm sạch + cắt độ dài trước khi vào tin nhắn; URL chỉ nhận https thuộc host của nhà cung cấp.
 */

/** Ký tự điều khiển C0/C1 (trừ khoảng trắng thường) + bidi override/isolate dùng để giả mạo hiển thị. */
function isUnsafeCodePoint(cp: number): boolean {
  return (
    cp <= 0x08 ||
    cp === 0x0b ||
    cp === 0x0c ||
    (cp >= 0x0e && cp <= 0x1f) ||
    (cp >= 0x7f && cp <= 0x9f) ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2066 && cp <= 0x2069) ||
    cp === 0xfeff
  );
}

/** Bỏ ký tự không an toàn theo mã điểm (không dùng regex ký tự điều khiển — đọc được, không cần tắt luật lint). */
function stripUnsafe(input: string): string {
  let out = "";
  for (const ch of input) if (!isUnsafeCodePoint(ch.codePointAt(0) ?? 0)) out += ch;
  return out;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Chuỗi 1 dòng: bỏ ký tự nguy hiểm, gộp mọi khoảng trắng/xuống dòng, cắt tới `max` ký tự (thêm `…`). Không phải chuỗi → rỗng. */
export function cleanText(input: unknown, max: number): string {
  if (typeof input !== "string") return "";
  const flat = stripUnsafe(input).replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, Math.max(0, max - 1)).trimEnd()}…` : flat;
}

/** Dòng đầu (tiêu đề commit) rồi cắt như `cleanText`. */
export function firstLine(input: unknown, max: number): string {
  if (typeof input !== "string") return "";
  return cleanText(input.split(/\r?\n/)[0] ?? "", max);
}

/** URL https thuộc `allowedHosts` (chính xác hoặc subdomain) → chuỗi chuẩn hoá; ngược lại `undefined` (không đưa link lạ vào tin). */
export function safeHttpsUrl(raw: unknown, allowedHosts: readonly string[]): string | undefined {
  if (typeof raw !== "string" || raw.length > 2000) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    const host = url.hostname.toLowerCase();
    if (!allowedHosts.some((h) => host === h || host.endsWith(`.${h}`))) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function shortSha(id: unknown): string {
  return typeof id === "string" ? id.replace(/[^0-9a-f]/gi, "").slice(0, 7) : "";
}

/** `refs/heads/main` → `main`; tag/ref khác → `null`. */
export function branchOf(ref: unknown): string | null {
  return typeof ref === "string" && ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : null;
}

export function positiveInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

/** Tên hiển thị của người thực hiện (login/handle) đã làm sạch; rỗng → `undefined`. */
export function actorOf(login: unknown, avatarUrl: unknown, avatarHosts: readonly string[]): { login: string; avatarUrl?: string } | undefined {
  const name = cleanText(login, 60);
  if (!name) return undefined;
  const avatar = safeHttpsUrl(avatarUrl, avatarHosts);
  return avatar ? { login: name, avatarUrl: avatar } : { login: name };
}
