/**
 * Trợ giúp cho `aggregateRaw` (Prisma + MongoDB): đầu vào là Extended JSON (`{ $oid }`, `{ $date }`), đầu ra có thể là số thường hoặc `{ $numberInt|$numberLong|$numberDouble }`.
 */
import type { Prisma } from "@prisma/client";

export const oid = (id: string): { $oid: string } => ({ $oid: id });
export const dateEjson = (d: Date): { $date: string } => ({ $date: d.toISOString() });

/** Ngày dạng `YYYY-MM-DD` theo múi giờ IANA — nhóm ngay trong pipeline (chạy được từ MongoDB 3.6, không cần `$dateTrunc` ≥ 5.0). */
export const dayKeyOf = (field: string, tz: string): Prisma.InputJsonObject => ({ $dateToString: { format: "%Y-%m-%d", date: field, timezone: tz } });

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
