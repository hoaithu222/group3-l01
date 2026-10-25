/** `YYYYMMDD` (UTC) — khoá "1 thông báo/nhóm(hoặc report)/ngày" (be.md p1-08 §5.2, §5.5). */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}
