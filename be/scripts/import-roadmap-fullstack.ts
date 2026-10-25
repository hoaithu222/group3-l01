#!/usr/bin/env ts-node
/**
 * ============================================================================
 * IMPORT lộ trình Lập trình Fullstack (be.md p4-07 §9.1)
 * ============================================================================
 * Đọc D:\work\base-project\fullstack (7 tháng T1–T7, 56 buổi) → RoadmapSubject/Phase/Lesson/Media. Idempotent theo
 * slug `fullstack-b<N>`: buổi ADMIN ĐÃ SỬA (`updatedBy` khác null) giữ nguyên trừ khi `--overwrite`.
 *
 * Sử dụng:
 *   npm run roadmap:import:fullstack -- --dir "D:\work\base-project\fullstack" --dry-run
 *   npm run roadmap:import:fullstack -- --dir "D:\work\base-project\fullstack"
 *   npm run roadmap:import:fullstack -- --dir "D:\work\base-project\fullstack" --overwrite
 * ============================================================================
 */
import { PrismaClient } from "@prisma/client";
import { importFullstackRoadmap } from "../src/modules/roadmap/importers/fullstack-import";

function argValue(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main(): Promise<void> {
  const dir = argValue("--dir", "D:\\work\\base-project\\fullstack");
  const dryRun = process.argv.includes("--dry-run");
  const overwrite = process.argv.includes("--overwrite");
  const prisma = new PrismaClient();

  const report = await importFullstackRoadmap(prisma, { dir, dryRun, overwrite });

  const byStatus = { created: 0, updated: 0, "skipped-edited": 0, unchanged: 0, "missing-file": 0 };
  let totalMedia = 0;
  let totalResources = 0;
  let totalWarnings = 0;
  for (const l of report.lessons) {
    byStatus[l.status] += 1;
    totalMedia += l.mediaCount;
    totalResources += l.resourceCount;
    totalWarnings += l.warnings.length;
    if (l.status === "missing-file") console.log(`⚠ Thiếu file — buổi ${l.number}`);
    if (l.warnings.length > 0) for (const w of l.warnings) console.log(`  [B${l.number}] ${w}`);
  }

  console.log("");
  console.log(`${dryRun ? "[DRY RUN] " : ""}Lộ trình Fullstack — ${report.phases} tháng, ${report.lessons.length} buổi`);
  console.log(`  Tạo mới: ${byStatus.created} · Cập nhật: ${byStatus.updated} · Bỏ qua (admin đã sửa): ${byStatus["skipped-edited"]} · Không đổi (dry-run): ${byStatus.unchanged} · Thiếu file: ${byStatus["missing-file"]}`);
  console.log(`  Tổng ảnh SVG: ${totalMedia} · Tổng tài liệu: ${totalResources} · Cảnh báo: ${totalWarnings}`);

  await prisma.$disconnect();
  if (byStatus["missing-file"] > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Import lộ trình Fullstack thất bại:", err);
  process.exit(1);
});
