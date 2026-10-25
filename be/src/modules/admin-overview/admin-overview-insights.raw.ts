/**
 * Trợ giúp cho `aggregateRaw` (Prisma + MongoDB) của insights. Đầu vào là Extended JSON (`{ $date }`); đầu ra là số thường hoặc
 * `{ $numberInt|$numberLong|… }`, ObjectId là `{ $oid }`. Viết riêng ở đây (không import chéo từ `admin-media-ops`) để module tự đủ.
 */
import type { Prisma } from "@prisma/client";

export type Stage = Prisma.InputJsonObject;
export type Doc = Record<string, unknown>;

export const ejsonDate = (d: Date): { $date: string } => ({ $date: d.toISOString() });
export const rangeOf = (from: Date, to: Date): Stage => ({ $gte: ejsonDate(from), $lt: ejsonDate(to) });

/** Khoá ngày `YYYY-MM-DD` theo UTC, nhóm ngay trong pipeline (không cần `$dateTrunc` ≥ 5.0). */
export const utcDayKey = (field: string): Stage => ({ $dateToString: { format: "%Y-%m-%d", date: field, timezone: "UTC" } });

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

export const idOf = (v: unknown): string => (typeof v === "object" && v !== null && "$oid" in v ? String((v as { $oid: string }).$oid) : String(v));

/** `aggregateRaw` trả mảng tài liệu thô (kiểu khai báo của Prisma là JsonObject). */
export const docsOf = (raw: Prisma.JsonObject): Doc[] => raw as unknown as Doc[];

/** Lấy mảng con `key` của tài liệu `$facet` duy nhất (vắng → rỗng). */
export function facetOf(raw: Prisma.JsonObject, key: string): Doc[] {
  const first = docsOf(raw)[0];
  const arr = first?.[key];
  return Array.isArray(arr) ? (arr as Doc[]) : [];
}

/** `[{ _id: "YYYY-MM-DD", n }]` → bảng đếm theo ngày. */
export function toDayMap(rows: Doc[], valueKey = "n"): Map<string, number> {
  return new Map(rows.map((r) => [String(r._id), num(r[valueKey])]));
}
