import { prisma } from "../../../infrastructure/database";
import type { IAssetLinkRepository } from "./asset-link.repository.interface";
import type { AssetLink, AssetLinkTargetType, AssetLinkScopeType } from "../entities/asset.interface";

type AssetLinkRecord = Awaited<ReturnType<typeof prisma.assetLink.findFirstOrThrow>>;

function mapToEntity(record: AssetLinkRecord): AssetLink {
  return {
    id: record.id,
    assetId: record.assetId,
    targetType: record.targetType as AssetLinkTargetType,
    targetId: record.targetId,
    scopeType: record.scopeType as AssetLinkScopeType,
    scopeId: record.scopeId,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
  };
}

export class PrismaAssetLinkRepository implements IAssetLinkRepository {
  async listByAsset(assetId: string, limit = 50): Promise<AssetLink[]> {
    const records = await prisma.assetLink.findMany({ where: { assetId }, take: limit });
    return records.map(mapToEntity);
  }

  async listByTarget(targetType: AssetLinkTargetType, targetId: string): Promise<AssetLink[]> {
    const records = await prisma.assetLink.findMany({ where: { targetType, targetId } });
    return records.map(mapToEntity);
  }

  async existsForAsset(assetId: string): Promise<boolean> {
    const found = await prisma.assetLink.findFirst({ where: { assetId }, select: { id: true } });
    return found !== null;
  }
}
