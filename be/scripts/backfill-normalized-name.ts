#!/usr/bin/env ts-node
/**
 * ============================================================================
 * BACKFILL normalizedName (User)
 * ============================================================================
 *
 * User cũ tạo trước khi có field `normalizedName` (B7 — tìm kiếm không dấu)
 * có giá trị mặc định "". Script này tính lại `normalizedName` từ `name`
 * hiện tại cho các user đó.
 *
 * Sử dụng:
 *   npm run db:backfill-normalized-name
 * ============================================================================
 */
import { PrismaClient } from "@prisma/client";
import { normalizeSearch } from "../src/core/utils/normalize";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { normalizedName: "" },
    select: { id: true, name: true },
  });

  console.log(`Tìm thấy ${users.length} user cần backfill normalizedName.`);

  let updated = 0;
  for (const user of users) {
    const normalizedName = normalizeSearch(user.name);
    if (!normalizedName) continue;
    await prisma.user.update({ where: { id: user.id }, data: { normalizedName } });
    updated++;
  }

  console.log(`Đã cập nhật ${updated}/${users.length} user.`);
}

main()
  .catch((err) => {
    console.error("Backfill thất bại:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
