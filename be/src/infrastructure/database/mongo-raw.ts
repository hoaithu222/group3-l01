/**
 * Tiện ích cho truy vấn thô (`findRaw`) của Prisma 5.22 trên MongoDB — nâng từ `discovery` (p1-09) lên dùng chung (p5-04).
 * Đã kiểm chứng với MongoDB thật (mongodb-memory-server): `options.maxTimeMS` là struct `Duration`, hết hạn → P2010 `MaxTimeMSExpired`.
 */

/**
 * `findRaw` (driver Rust) giải mã `options.maxTimeMS` thành struct `Duration` `{ secs, nanos }` — số nguyên mili-giây bị từ chối
 * ("expected struct Duration").
 */
export function toMaxTimeDuration(ms: number): { secs: number; nanos: number } {
  const total = Math.max(1, Math.floor(ms));
  const secs = Math.floor(total / 1000);
  return { secs, nanos: (total - secs * 1000) * 1_000_000 };
}

/** MongoDB báo hết `maxTimeMS` bằng code 50 `MaxTimeMSExpired` — Prisma gói vào `PrismaClientKnownRequestError` (P2010) kèm message gốc. */
export function isMaxTimeExpired(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return /MaxTimeMSExpired|exceeded time limit|operation exceeded/i.test(text);
}

/** `findRaw` trả mảng Extended JSON — chỉ lấy `_id.$oid` (chi tiết đọc lại bằng Prisma có kiểu). */
export function rawObjectIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const doc of raw) {
    const id = (doc as { _id?: { $oid?: unknown } } | null)?._id?.$oid;
    if (typeof id === "string") ids.push(id);
  }
  return ids;
}
