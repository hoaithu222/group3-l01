/**
 * Index MongoDB mà Prisma KHÔNG khai được trong `schema.prisma` (p6-05 README §2): `2dsphere` cho truy vấn địa lý `$geoNear`.
 * Tạo bằng lệnh `createIndexes` — idempotent (index đã có cùng khoá + tên → Mongo bỏ qua). Nơi chạy:
 * - `npm run db:ensure-indexes` (`scripts/ensure-indexes.ts`) — bước deploy NGAY SAU `db push`;
 * - `src/tests/global-setup.ts` khi `TEST_DB=memory` (Mongo trong bộ nhớ, KHÔNG BAO GIỜ DB thật).
 * File THUẦN (không import Prisma client/env) để global-setup của Jest dùng được.
 */
export interface ManualIndexSpec {
  /** Tên collection (= tên model Prisma khi không có `@@map`). */
  collection: string;
  indexes: Array<{ key: Record<string, 1 | -1 | "2dsphere">; name: string }>;
}

export const MANUAL_INDEXES: readonly ManualIndexSpec[] = [{ collection: "Location", indexes: [{ key: { geo: "2dsphere" }, name: "geo_2dsphere" }] }];

/** Chạy `createIndexes` cho mọi spec qua `runCommand` (Prisma `$runCommandRaw` hoặc driver). Trả danh sách `collection.index` đã đảm bảo. */
export async function ensureManualIndexes(runCommand: (command: Record<string, unknown>) => Promise<unknown>): Promise<string[]> {
  const done: string[] = [];
  for (const spec of MANUAL_INDEXES) {
    await runCommand({ createIndexes: spec.collection, indexes: spec.indexes });
    done.push(...spec.indexes.map((i) => `${spec.collection}.${i.name}`));
  }
  return done;
}
