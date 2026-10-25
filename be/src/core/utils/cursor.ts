/**
 * Cursor pagination theo `(at, id) desc` — mã hoá base64url của "<at ISO>|<id>".
 * Dùng chung cho mọi danh sách sắp theo thời gian (audit log, inbox thông báo, ...).
 */
export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`).toString("base64url");
}

export function decodeCursor(cursor: string): { at: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const [atStr, id] = raw.split("|");
    if (!atStr || !id) return null;
    const at = new Date(atStr);
    if (Number.isNaN(at.getTime())) return null;
    return { at, id };
  } catch {
    return null;
  }
}

/**
 * Cursor theo CHỈ SỐ (`n:<offset>`, base64url) cho danh sách nhỏ tính trong bộ nhớ (kết quả tìm kênh/người, người chưa xác nhận…)
 * không có khoá `(at, id)` ổn định. Hỏng/vắng → offset 0.
 */
export function encodeOffsetCursor(offset: number): string {
  return Buffer.from(`n:${offset}`).toString("base64url");
}

export function decodeOffsetCursor(raw: string | undefined): number {
  if (!raw) return 0;
  const match = /^n:(\d{1,7})$/.exec(Buffer.from(raw, "base64url").toString("utf8"));
  return match ? Number(match[1]) : 0;
}
