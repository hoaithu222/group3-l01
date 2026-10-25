#!/usr/bin/env ts-node
/**
 * ============================================================================
 * MIGRATE Asset.attachedType/attachedId → AssetLink (p0-05)
 * ============================================================================
 *
 * Trước p0-05, `Asset` gắn trực tiếp vào 1 đối tượng qua 2 field tự do
 * `attachedType`/`attachedId` (không có khái niệm scope quyền). p0-05 thay
 * bằng model `AssetLink` (nhiều-nhiều + `scopeType`/`scopeId` cho
 * `AssetAccessService.canRead`). Script này chuyển dữ liệu cũ sang model mới,
 * CHẠY 1 LẦN — idempotent: gọi lại nhiều lần không tạo `AssetLink` trùng
 * (kiểm `@@unique([assetId, targetType, targetId])` trước khi tạo).
 *
 * `attachedType` là chuỗi tự do (không phải enum) ở bản cũ — quy về
 * `AssetLinkTarget` nếu khớp tên (không phân biệt hoa/thường), ngược lại rơi
 * vào `OTHER` (không có cách suy ra chính xác từ dữ liệu cũ). `scopeType`
 * migrate về `NONE` (chỉ chủ sở hữu đọc được) — CHỦ ĐÍCH bảo thủ: module sở
 * hữu đối tượng đó (khi được xây ở Phase 1+) tự `replace()`/`attach()` lại
 * với `scopeType` đúng khi cần, an toàn hơn là đoán sai rồi lộ quyền đọc.
 *
 * Sử dụng: `npx ts-node -r tsconfig-paths/register scripts/migrate-asset-links.ts`
 * ============================================================================
 */
import { PrismaClient } from "@prisma/client";
import { ASSET_LINK_TARGETS, type AssetLinkTargetType } from "../src/modules/assets/entities/asset.interface";

const prisma = new PrismaClient();
const BATCH_SIZE = 200;

function mapTargetType(attachedType: string): AssetLinkTargetType {
  const upper = attachedType.trim().toUpperCase();
  return (ASSET_LINK_TARGETS as readonly string[]).includes(upper) ? (upper as AssetLinkTargetType) : "OTHER";
}

export interface MigrationResult {
  scanned: number;
  migrated: number;
  skippedExisting: number;
  skippedInvalid: number;
}

/** Idempotent — export riêng để test gọi trực tiếp (không qua CLI `main()`). */
export async function migrateAssetLinks(): Promise<MigrationResult> {
  const result: MigrationResult = { scanned: 0, migrated: 0, skippedExisting: 0, skippedInvalid: 0 };
  let cursor: string | undefined;

  for (;;) {
    const batch = await prisma.asset.findMany({
      where: { attachedType: { not: null }, attachedId: { not: null } },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1]!.id;
    result.scanned += batch.length;

    for (const asset of batch) {
      if (!asset.attachedType || !asset.attachedId) {
        result.skippedInvalid += 1;
        continue;
      }
      const targetType = mapTargetType(asset.attachedType);

      const existing = await prisma.assetLink.findUnique({
        where: {
          assetId_targetType_targetId: { assetId: asset.id, targetType, targetId: asset.attachedId },
        },
        select: { id: true },
      });
      if (existing) {
        result.skippedExisting += 1;
        continue;
      }

      await prisma.assetLink.create({
        data: {
          assetId: asset.id,
          targetType,
          targetId: asset.attachedId,
          scopeType: "NONE",
          createdBy: asset.ownerId,
        },
      });
      result.migrated += 1;
    }

    if (batch.length < BATCH_SIZE) break;
  }

  return result;
}

async function main(): Promise<void> {
  const result = await migrateAssetLinks();
  console.log(
    `[migrate-asset-links] Quét ${result.scanned} asset — đã tạo ${result.migrated} AssetLink ` +
      `(${result.skippedExisting} đã tồn tại từ trước, ${result.skippedInvalid} thiếu dữ liệu bị bỏ qua).`
  );
}

// Chỉ chạy `main()` khi gọi trực tiếp qua CLI — import từ test không tự chạy.
if (require.main === module) {
  main()
    .catch((err) => {
      console.error("Migrate asset links thất bại:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
