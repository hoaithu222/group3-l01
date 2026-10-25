#!/usr/bin/env ts-node
/**
 * ============================================================================
 * BACKFILL Workspace.avatarAssetId / Workspace.coverAssetId từ AssetLink
 * ============================================================================
 *
 * Trước bản vá ảnh nhóm, `WorkspaceService` chỉ tạo `AssetLink(WORKSPACE_AVATAR)` mà KHÔNG ghi cột
 * `Workspace.avatarAssetId` — presenter giờ dựng URL ảnh từ CỘT, nên nhóm cũ có ảnh sẽ hiện chữ cái đầu cho tới khi
 * chạy script này. Idempotent: chỉ ghi nhóm có cột trống (hoặc lệch) mà còn link, chạy lại không đổi gì thêm.
 * `WORKSPACE_COVER` chạy cùng lượt cho đủ bộ (link mới luôn ghi cột nên thường không có gì để sửa).
 *
 * Sử dụng:
 *   npm run db:backfill-workspace-images            # ghi thật
 *   npm run db:backfill-workspace-images -- --dry   # chỉ đếm, không ghi
 * ============================================================================
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry");

const TARGETS = [
  { targetType: "WORKSPACE_AVATAR", column: "avatarAssetId" },
  { targetType: "WORKSPACE_COVER", column: "coverAssetId" },
] as const;

async function backfill(target: (typeof TARGETS)[number]): Promise<void> {
  // Link mới nhất thắng nếu một nhóm lỡ có nhiều link cùng đích (`replace` luôn gỡ link cũ nên bình thường chỉ có một).
  const links = await prisma.assetLink.findMany({
    where: { targetType: target.targetType },
    orderBy: { createdAt: "asc" },
    select: { targetId: true, assetId: true },
  });
  const latest = new Map(links.map((l) => [l.targetId, l.assetId]));
  let updated = 0;
  for (const [workspaceId, assetId] of latest) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { avatarAssetId: true, coverAssetId: true },
    });
    if (!workspace || workspace[target.column] === assetId) continue;
    if (!DRY_RUN) {
      // Không tăng `version`: cột chỉ bắt kịp link đã có, nội dung nhóm không đổi với người dùng.
      await prisma.workspace.update({ where: { id: workspaceId }, data: { [target.column]: assetId } });
    }
    updated++;
  }
  console.log(`${target.targetType}: ${latest.size} nhóm có link, ${updated} nhóm ${DRY_RUN ? "cần" : "đã"} cập nhật cột ${target.column}.`);
}

async function main(): Promise<void> {
  for (const target of TARGETS) await backfill(target);
}

main()
  .catch((err) => {
    console.error("Backfill thất bại:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
