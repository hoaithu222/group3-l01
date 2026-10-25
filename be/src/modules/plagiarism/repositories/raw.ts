/** Trợ giúp `aggregateRaw` (Prisma + MongoDB) — cùng mẫu `admin-media-ops/repositories/media-ops-raw.ts` (không import chéo module, file nhỏ nên nhân bản). */
export const oid = (id: string): { $oid: string } => ({ $oid: id });

export function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v) || 0;
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    const inner = o["$numberInt"] ?? o["$numberLong"] ?? o["$numberDouble"] ?? o["$numberDecimal"];
    if (inner !== undefined) return Number(inner) || 0;
  }
  return 0;
}
