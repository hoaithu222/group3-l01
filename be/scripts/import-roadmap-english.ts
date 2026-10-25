#!/usr/bin/env ts-node
/**
 * ============================================================================
 * IMPORT lộ trình Tiếng Anh giao tiếp & IT (be.md p4-07 §9.2)
 * ============================================================================
 * Tạo RoadmapSubject "english" + 4 Phase (A1–B2) + 25 Lesson, gắn `practiceSetIds` tới 16 StudySet PUBLIC đã seed
 * sẵn ở `study/seed/english-content.seed.ts` (khớp qua tag `seed:<slug>`, KHÔNG tạo StudySet mới). Idempotent theo
 * slug `english-d<N>`: buổi ADMIN ĐÃ SỬA (`updatedBy` khác null) giữ nguyên trừ khi `--overwrite`.
 *
 * Sử dụng:
 *   npm run roadmap:import:english -- --dry-run
 *   npm run roadmap:import:english
 *   npm run roadmap:import:english -- --overwrite
 * ============================================================================
 */
import { PrismaClient } from "@prisma/client";
import { importEnglishRoadmap } from "../src/modules/roadmap/importers/english-content";

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const overwrite = process.argv.includes("--overwrite");
  const prisma = new PrismaClient();

  const report = await importEnglishRoadmap(prisma, { dryRun, overwrite });

  const byStatus = { created: 0, updated: 0, "skipped-edited": 0, unchanged: 0 };
  let totalPracticeSets = 0;
  let totalWarnings = 0;
  for (const l of report.lessons) {
    byStatus[l.status] += 1;
    totalPracticeSets += l.practiceSetCount;
    totalWarnings += l.warnings.length;
    if (l.warnings.length > 0) for (const w of l.warnings) console.log(`  [D${l.number}] ${w}`);
  }

  console.log("");
  console.log(`${dryRun ? "[DRY RUN] " : ""}Lộ trình Tiếng Anh — ${report.phases} tháng, ${report.lessons.length} ngày`);
  console.log(`  Tạo mới: ${byStatus.created} · Cập nhật: ${byStatus.updated} · Bỏ qua (admin đã sửa): ${byStatus["skipped-edited"]} · Không đổi (dry-run): ${byStatus.unchanged}`);
  console.log(`  Tổng lượt gắn bộ luyện tập: ${totalPracticeSets} · Cảnh báo: ${totalWarnings}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Import lộ trình Tiếng Anh thất bại:", err);
  process.exit(1);
});
