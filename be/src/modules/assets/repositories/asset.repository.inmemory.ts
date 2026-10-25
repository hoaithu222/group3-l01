import { newObjectId } from "../../../core/utils/object-id";
import type { IAssetRepository } from "./asset.repository.interface";
import type { Asset, AssetCreateInput, AssetUpdateInput } from "../entities/asset.interface";

const store = new Map<string, Asset>();

const ACTIVE_CLEANUP_STATUSES = new Set(["UPLOADING", "PROCESSING", "READY", "REJECTED"]);

/** In-memory store — dùng cho test. */
export class InMemoryAssetRepository implements IAssetRepository {
  static clearStore(): void {
    store.clear();
  }

  async findById(id: string): Promise<Asset | null> {
    return store.get(id) ?? null;
  }

  async findByIds(ids: string[]): Promise<Asset[]> {
    return ids.map((id) => store.get(id)).filter((a): a is Asset => !!a);
  }

  async findChildren(parentAssetId: string): Promise<Asset[]> {
    return Array.from(store.values()).filter((a) => a.parentAssetId === parentAssetId);
  }

  async create(input: AssetCreateInput): Promise<Asset> {
    const asset: Asset = {
      id: input.id ?? newObjectId(),
      ownerId: input.ownerId,
      workspaceId: input.workspaceId ?? null,
      scope: input.scope,
      kind: input.kind,
      variant: input.variant ?? "ORIGINAL",
      parentAssetId: input.parentAssetId ?? null,
      status: input.status,
      uploadMethod: input.uploadMethod,
      mime: input.mime,
      declaredSize: input.declaredSize,
      size: input.size ?? null,
      originalName: input.originalName,
      storageKey: input.storageKey,
      checksum: input.checksum ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      durationMs: null,
      waveform: null,
      thumbnailAssetId: null,
      rejectReason: null,
      createdAt: new Date(),
      processedAt: null,
      readyAt: null,
      deletedAt: null,
      lastUnlinkedAt: null,
    };
    store.set(asset.id, asset);
    return asset;
  }

  async update(id: string, input: AssetUpdateInput): Promise<Asset | null> {
    const existing = store.get(id);
    if (!existing) return null;
    const updated: Asset = { ...existing, ...input };
    store.set(id, updated);
    return updated;
  }

  async claimForProcessing(id: string): Promise<boolean> {
    const existing = store.get(id);
    return existing?.status === "PROCESSING";
  }

  async markDeleted(id: string): Promise<Asset | null> {
    return this.update(id, { status: "DELETED", deletedAt: new Date() });
  }

  async findCleanupCandidates(olderThan: Date, limit: number): Promise<Asset[]> {
    return Array.from(store.values())
      .filter(
        (a) =>
          a.variant === "ORIGINAL" &&
          ACTIVE_CLEANUP_STATUSES.has(a.status) &&
          (a.lastUnlinkedAt ?? a.createdAt) < olderThan
      )
      .slice(0, limit);
  }
}
