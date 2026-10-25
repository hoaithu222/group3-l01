import type { NoticeCode } from "./bridge-protocol";

const CODES: readonly NoticeCode[] = ["SAVE_FAILED", "SAVE_RECOVERED", "TOO_LARGE", "ARCHIVED", "RESTORED", "READ_ONLY"];

/**
 * Thông báo server gửi qua `provider.on("stateless")`: `{ "v": 1, "type": "notice", "code": … }` (`collab/README.md` §3.5).
 * Payload lạ/hỏng/mã chưa biết → `null` (bỏ qua, tương thích lùi khi server thêm mã mới).
 */
export function parseNotice(payload: string): NoticeCode | null {
  if (payload.length === 0 || payload.length > 1024) return null;
  try {
    const value: unknown = JSON.parse(payload);
    if (typeof value !== "object" || value === null) return null;
    const { v, type, code } = value as Record<string, unknown>;
    if (v !== 1 || type !== "notice" || typeof code !== "string") return null;
    return (CODES as readonly string[]).includes(code) ? (code as NoticeCode) : null;
  } catch {
    return null;
  }
}
