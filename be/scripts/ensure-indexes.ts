/**
 * `npm run db:ensure-indexes` — tạo index MongoDB mà Prisma không khai được (p6-05: `Location.geo` 2dsphere cho `$geoNear`).
 * Idempotent; chạy trong runbook deploy NGAY SAU `npm run db:push` (thiếu index → `GET /locations/near` lỗi 500 "unable to find
 * index for $geoNear query"). Danh sách index ở `src/infrastructure/database/manual-indexes.ts` (dùng chung với Jest global-setup).
 *
 * ⚠ Chạy vào DB mà `DATABASE_URL` trỏ tới — đọc kỹ biến môi trường trước khi chạy ở máy dev (be/.env có thể là Atlas thật).
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { ensureManualIndexes } from "../src/infrastructure/database/manual-indexes";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const done = await ensureManualIndexes((command) => prisma.$runCommandRaw(command as Prisma.InputJsonObject));
    // eslint-disable-next-line no-console
    console.log(`[ensure-indexes] OK: ${done.join(", ")}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error("[ensure-indexes] Lỗi:", err instanceof Error ? err.message : err);
  process.exit(1);
});
