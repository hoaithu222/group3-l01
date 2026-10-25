import type { Prisma } from "@prisma/client";
import { storage } from "../../../infrastructure/storage";
import type { IAssetRepository } from "../repositories/asset.repository.interface";
import type { IAssetLinkRepository } from "../repositories/asset-link.repository.interface";
import { newObjectId } from "../../../core/utils/object-id";
import type { Asset, AssetKind, AssetScope } from "../entities/asset.interface";

/** (p2-06) Object ĐÃ có trên storage do bên thứ ba ghi (LiveKit Egress → S3) cần đăng ký thành `Asset`. */
export interface RegisterStoredObjectInput {
  scope: AssetScope;
  ownerId: string;
  workspaceId?: string;
  kind: AssetKind;
  mime: string;
  /** Tên hiển thị/tải về (KHÔNG dùng dựng khoá storage). */
  fileName: string;
  /** Khoá object đã tồn tại trong storage — caller đã `head()` xác nhận. */
  storageKey: string;
  /** Kích thước thật (byte) — phải nằm trong Int32 của `Asset.size`. */
  size: number;
  durationMs?: number;
}

/**
 * Cổng "vòng đời asset" cho module khác (export qua `@modules/assets/public`) — thay cho việc import repository
 * nội bộ của `assets`. Dùng bởi `resources` (p3-01): kiểm asset trước khi gắn (`getForAttach`) và dọn vĩnh viễn
 * khi purge thùng rác (`storageKeysOf` → `deleteObjects` → `markDeleted`).
 */
export class AssetLifecycleService {
  constructor(
    private readonly repo: IAssetRepository,
    private readonly linkRepo: IAssetLinkRepository
  ) {}

  /** Asset + đã gắn `AssetLink` nào chưa — `null` nếu không tồn tại. Caller tự kiểm chủ/scope/trạng thái. */
  async getForAttach(assetId: string): Promise<{ asset: Asset; linked: boolean } | null> {
    const asset = await this.repo.findById(assetId);
    if (!asset) return null;
    return { asset, linked: await this.linkRepo.existsForAsset(asset.id) };
  }

  /** Mọi storage key của asset gốc + asset con (thumbnail/poster) — cho bước xoá object khi purge. */
  async storageKeysOf(assetId: string): Promise<string[]> {
    const asset = await this.repo.findById(assetId);
    if (!asset) return [];
    const children = await this.repo.findChildren(asset.id);
    return [asset.storageKey, ...children.map((c) => c.storageKey)].filter((key) => key.length > 0);
  }

  /** Xoá object khỏi storage. KHÔNG nuốt lỗi — caller (job purge) cần biết để thử lại ở lượt sau. */
  async deleteObjects(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await storage.deleteMany(keys);
  }

  /**
   * (p2-06) Trong transaction của caller: đăng ký object ĐÃ CÓ trên storage thành `Asset READY` (bỏ qua 2 bước upload + job `asset.process`: nội dung do hạ
   * tầng của ta ghi, không có gì để xử lý lại). `storageKey` là unique — trùng (lượt import chạy song song) ném P2002 để caller xử lý. Caller `attach` link
   * NGAY trong cùng transaction (asset chưa link quá `orphanTtlHours` sẽ bị `assets.cleanup` dọn cả object).
   */
  async registerStoredObject(tx: Prisma.TransactionClient, input: RegisterStoredObjectInput): Promise<{ assetId: string }> {
    const now = new Date();
    const created = await tx.asset.create({
      data: {
        id: newObjectId(),
        ownerId: input.ownerId,
        workspaceId: input.workspaceId,
        scope: input.scope,
        kind: input.kind,
        variant: "ORIGINAL",
        status: "READY",
        uploadMethod: "API_PUT",
        mime: input.mime,
        declaredSize: input.size,
        size: input.size,
        originalName: input.fileName,
        storageKey: input.storageKey,
        durationMs: input.durationMs,
        processedAt: now,
        readyAt: now,
      },
      select: { id: true },
    });
    return { assetId: created.id };
  }

  /** Trong transaction của caller: đánh dấu asset gốc + mọi asset con `DELETED` (không còn ai đọc được). */
  async markDeleted(tx: Prisma.TransactionClient, assetId: string): Promise<void> {
    await tx.asset.updateMany({
      where: { OR: [{ id: assetId }, { parentAssetId: assetId }] },
      data: { status: "DELETED", deletedAt: new Date() },
    });
  }
}
