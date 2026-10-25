#!/usr/bin/env ts-node
/**
 * ============================================================================
 * SEED mẫu workspace (p5-04)
 * ============================================================================
 *
 * Tạo 3 mẫu nền tảng (`course`, `capstone`, `self-study`) nếu CHƯA có — idempotent theo `code`. Mẫu đã có (kể cả bản admin đã sửa
 * ở `/admin/workspace-templates`) được GIỮ NGUYÊN; thêm `--force` để ghi đè nội dung bằng bản seed (tăng `version`).
 *
 * Sử dụng:
 *   npm run db:seed:templates
 *   npm run db:seed:templates -- --force
 * ============================================================================
 */
import { disconnectPrisma } from "../src/infrastructure/database/prisma.client";
import { PrismaWorkspaceTemplateRepository } from "../src/modules/workspace-templates/workspace-templates.repo";
import { TEMPLATE_SEEDS } from "../src/modules/workspace-templates/seed/templates.seed";
import { templateChannelsSchema } from "../src/modules/workspace-templates/workspace-templates.validators";

async function main(): Promise<void> {
  const overwrite = process.argv.includes("--force");
  const repo = new PrismaWorkspaceTemplateRepository();

  const counts = { created: 0, updated: 0, kept: 0 };
  for (const def of TEMPLATE_SEEDS) {
    // Seed sai định dạng = lỗi lập trình — dừng ngay thay vì ghi dữ liệu hỏng.
    const parsed = templateChannelsSchema.safeParse(def.channels);
    if (!parsed.success) throw new Error(`Mẫu "${def.code}" không hợp lệ: ${parsed.error.message}`);
    counts[await repo.seed({ ...def, channels: parsed.data }, overwrite)] += 1;
  }
  console.log(`Seed mẫu workspace: tạo ${counts.created}, ghi đè ${counts.updated}, giữ nguyên ${counts.kept}.`);
}

main()
  .catch((err) => {
    console.error("Seed mẫu workspace thất bại:", err);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectPrisma();
  });
