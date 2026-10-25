/** Khoá coi là nhạy cảm — che giá trị khi hiển thị cho admin (be.md §5.7). */
/**
 * Ngoài các khoá chứa từ nhạy cảm còn che người nhận (`to`/`cc`/`bcc`/`recipient*`) và liên
 * kết (`*link`/`*url`): payload `mail.send` là `{ template, to, vars }` với `to` là email người
 * nhận và `vars.resetLink` mang token — không khoá nào chứa chữ "email"/"token". `to`/`cc`/`bcc`
 * phải khớp NGUYÊN khoá, kẻo che nhầm `total`, `photo`…
 */
const SENSITIVE_KEY = /token|password|secret|content|body|email|phone|recipient|(^(to|cc|bcc)$)|link$|url$/i;
const MAX_PREVIEW_BYTES = 2 * 1024;
/** Chặn đệ quy bất thường (payload lồng sâu/cycle) — không phải giới hạn nghiệp vụ. */
const MAX_DEPTH = 10;

function maskValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return "***";
  if (Array.isArray(value)) return value.map((v) => maskValue(v, depth + 1));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? "***" : maskValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Che đệ quy các khoá nhạy cảm (`token`/`password`/`secret`/`content`/`body`/
 * `email`/`phone`/người nhận/liên kết, không phân biệt hoa thường) trong payload job/outbox trước
 * khi trả về cho admin UI. Giới hạn preview 2 KiB — payload lớn hơn bị cắt và
 * đánh dấu `truncated`.
 */
export function maskPayload(payload: unknown): unknown {
  const masked = maskValue(payload, 0);
  const json = JSON.stringify(masked) ?? "null";
  if (Buffer.byteLength(json, "utf8") <= MAX_PREVIEW_BYTES) return masked;
  return { truncated: true, preview: json.slice(0, MAX_PREVIEW_BYTES) };
}
