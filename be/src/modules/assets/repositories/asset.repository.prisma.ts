import { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { IAssetRepository } from "./asset.repository.interface";
import type {
  Asset,
  AssetCreateInput,
  AssetUpdateInput,
  AssetScope,
  AssetStatusValue,
  AssetKind,
  AssetVariant,
  UploadMethod,
} from "../entities/asset.interface";

type AssetRecord = Awaited<ReturnType<typeof prisma.asset.findFirstOrThrow>>;

const ACTIVE_CLEANUP_STATUSES: AssetStatusValue[] = ["UPLOADING", "PROCESSING", "READY", "REJECTED"];

export class PrismaAssetRepository implements IAssetRepository {
  private static mapToEntity(record: AssetRecord): Asset {
    return {
      id: record.id,
      ownerId: record.ownerId,
      workspaceId: record.workspaceId,
      scope: record.scope as AssetScope,
      kind: record.kind as AssetKind,
      variant: record.variant as AssetVariant,
      parentAssetId: record.parentAssetId,
      status: record.status as AssetStatusValue,
      uploadMethod: record.uploadMethod as UploadMethod,
      mime: record.mime,
      declaredSize: record.declaredSize,
      size: record.size,
      originalName: record.originalName,
      storageKey: record.storageKey,
      checksum: record.checksum,
      width: record.width,
      height: record.height,
      durationMs: record.durationMs,
      waveform: record.waveform?.points ?? null,
      thumbnailAssetId: record.thumbnailAssetId,
      rejectReason: record.rejectReason,
      createdAt: record.createdAt,
      processedAt: record.processedAt,
      readyAt: record.readyAt,
      deletedAt: record.deletedAt,
      lastUnlinkedAt: record.lastUnlinkedAt,
    };
  }

  async findById(id: string): Promise<Asset | null> {
    const record = await prisma.asset.findUnique({ where: { id } });
    return record ? PrismaAssetRepository.mapToEntity(record) : null;
  }

  async findByIds(ids: string[]): Promise<Asset[]> {
    if (ids.length === 0) return [];
    const records = await prisma.asset.findMany({ where: { id: { in: ids } } });
    return records.map(PrismaAssetRepository.mapToEntity);
  }

  async findChildren(parentAssetId: string): Promise<Asset[]> {
    const records = await prisma.asset.findMany({ where: { parentAssetId } });
    return records.map(PrismaAssetRepository.mapToEntity);
  }

  async create(input: AssetCreateInput): Promise<Asset> {
    const record = await prisma.asset.create({
      data: {
        id: input.id,
        ownerId: input.ownerId,
        scope: input.scope,
        kind: input.kind,
        variant: input.variant ?? "ORIGINAL",
        parentAssetId: input.parentAssetId,
        workspaceId: input.workspaceId,
        uploadMethod: input.uploadMethod,
        originalName: input.originalName,
        declaredSize: input.declaredSize,
        size: input.size,
        width: input.width,
        height: input.height,
        mime: input.mime,
        status: input.status,
        storageKey: input.storageKey,
        checksum: input.checksum,
      },
    });
    return PrismaAssetRepository.mapToEntity(record);
  }

  async update(id: string, input: AssetUpdateInput): Promise<Asset | null> {
    try {
      const record = await prisma.asset.update({
        where: { id },
        data: {
          ...(input.status !== undefined && { status: input.status }),
          ...(input.storageKey !== undefined && { storageKey: input.storageKey }),
          ...(input.checksum !== undefined && { checksum: input.checksum }),
          ...(input.rejectReason !== undefined && { rejectReason: input.rejectReason }),
          ...(input.thumbnailAssetId !== undefined && { thumbnailAssetId: input.thumbnailAssetId }),
          ...(input.size !== undefined && { size: input.size }),
          ...(input.width !== undefined && { width: input.width }),
          ...(input.height !== undefined && { height: input.height }),
          ...(input.durationMs !== undefined && { durationMs: input.durationMs }),
          ...(input.waveform !== undefined && {
            waveform: input.waveform ? { points: input.waveform } : null,
          }),
          ...(input.processedAt !== undefined && { processedAt: input.processedAt }),
          ...(input.readyAt !== undefined && { readyAt: input.readyAt }),
          ...(input.deletedAt !== undefined && { deletedAt: input.deletedAt }),
          ...(input.lastUnlinkedAt !== undefined && { lastUnlinkedAt: input.lastUnlinkedAt }),
          ...(input.attachedType !== undefined && { attachedType: input.attachedType }),
          ...(input.attachedId !== undefined && { attachedId: input.attachedId }),
        },
      });
      return PrismaAssetRepository.mapToEntity(record);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") return null;
      throw err;
    }
  }

  async claimForProcessing(id: string): Promise<boolean> {
    const result = await prisma.asset.updateMany({
      where: { id, status: "PROCESSING" },
      data: { status: "PROCESSING" },
    });
    return result.count > 0;
  }

  async markDeleted(id: string): Promise<Asset | null> {
    try {
      const record = await prisma.asset.update({
        where: { id },
        data: { status: "DELETED", deletedAt: new Date() },
      });
      return PrismaAssetRepository.mapToEntity(record);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") return null;
      throw err;
    }
  }

  async findCleanupCandidates(olderThan: Date, limit: number): Promise<Asset[]> {
    const records = await prisma.asset.findMany({
      where: {
        variant: "ORIGINAL",
        status: { in: ACTIVE_CLEANUP_STATUSES },
        OR: [
          { lastUnlinkedAt: { lt: olderThan } },
          // `lastUnlinkedAt: null` KHÔNG khớp field hoàn toàn vắng mặt trên
          // MongoDB qua Prisma (xác nhận bằng thử thật: asset chưa từng gỡ
          // link không hề có key `lastUnlinkedAt` trong document Mongo, và
          // filter `{ lastUnlinkedAt: null }` trả về RỖNG dù Prisma JS layer
          // đọc field đó ra là `null`) — phải dùng `isSet: false` (đặc thù
          // connector Mongo của Prisma) để khớp "chưa từng đặt giá trị".
          { lastUnlinkedAt: { isSet: false }, createdAt: { lt: olderThan } },
        ],
      },
      take: limit,
    });
    return records.map(PrismaAssetRepository.mapToEntity);
  }
}
