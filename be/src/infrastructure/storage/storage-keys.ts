/**
 * `buildKey` — khoá lưu trữ chuẩn cho asset (p0-05 §2 "Khoá storage"):
 * `{env}/{scope}/{yyyy}/{mm}/{assetId}/{variant}.{ext}` — KHÔNG dùng tên gốc
 * người dùng (tránh lộ tên thật, tránh ký tự lạ/path traversal).
 */
export function buildKey(
  nodeEnv: string,
  scope: string,
  assetId: string,
  variant: string,
  ext: string,
  now: Date = new Date()
): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${nodeEnv}/${scope.toLowerCase()}/${yyyy}/${mm}/${assetId}/${variant.toLowerCase()}.${ext}`;
}
