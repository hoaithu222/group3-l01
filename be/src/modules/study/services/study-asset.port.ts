import type { TxHandle } from "../repositories/tx";

export type StudyAssetTarget = "STUDY_ITEM" | "STUDY_SET_COVER";

/** Phần `Asset` mà bộ học cần để kiểm trước khi gắn (không kéo cả entity của `assets` vào module này). */
export interface StudyAssetInfo {
  id: string;
  ownerId: string;
  scope: string;
  variant: string;
  kind: string;
  status: string;
}

/**
 * Cổng sang module `assets` (chỉ qua `@modules/assets/public` — không import file trong `assets/services|repositories`):
 * kiểm asset trước khi gắn, gắn/gỡ `AssetLink { STUDY_ITEM | STUDY_SET_COVER }`, ký thumbnail ảnh bìa hàng loạt.
 * Test dùng `InMemoryStudyAssetPort` thay vì mock từng hàm.
 */
export interface IStudyAssetPort {
  /** Asset + đã gắn `AssetLink` nào chưa — `null` nếu không tồn tại. */
  get(assetId: string): Promise<{ asset: StudyAssetInfo; linked: boolean } | null>;
  /** `foreignReadable`: asset của người khác mà actor ĐỌC ĐƯỢC (nhân bản bộ) — chỉ tạo link mới, không chuyển chủ. */
  attach(
    tx: TxHandle,
    args: { assetIds: string[]; targetType: StudyAssetTarget; targetId: string; actorId: string; foreignReadable?: boolean }
  ): Promise<void>;
  /** Bỏ `assetIds` (mặc định MỌI asset) khỏi đối tượng — asset mồ côi để job dọn của p0-05 xử lý. */
  detach(tx: TxHandle, args: { targetType: StudyAssetTarget; targetId: string; assetIds?: string[] }): Promise<void>;
  /** Thumbnail ký ≤ 60 s cho ảnh bìa — CHỈ gọi khi caller đã lọc theo quyền xem bộ. */
  signThumbnails(assetIds: string[]): Promise<Map<string, string>>;
}

export interface InMemoryLink {
  assetId: string;
  targetType: StudyAssetTarget;
  targetId: string;
}

/** Test: kho asset trong bộ nhớ + sổ AssetLink để khẳng định (gắn/gỡ theo mục, nhân bản). */
export class InMemoryStudyAssetPort implements IStudyAssetPort {
  readonly assets = new Map<string, StudyAssetInfo>();
  readonly links: InMemoryLink[] = [];

  addReady(id: string, ownerId: string, kind: "IMAGE" | "AUDIO" = "IMAGE", extra: Partial<StudyAssetInfo> = {}): StudyAssetInfo {
    const asset: StudyAssetInfo = { id, ownerId, scope: "STUDY", variant: "ORIGINAL", kind, status: "READY", ...extra };
    this.assets.set(id, asset);
    return asset;
  }

  linksOf(targetType: StudyAssetTarget, targetId: string): string[] {
    return this.links.filter((l) => l.targetType === targetType && l.targetId === targetId).map((l) => l.assetId);
  }

  get(assetId: string) {
    const asset = this.assets.get(assetId);
    return Promise.resolve(asset ? { asset, linked: this.links.some((l) => l.assetId === assetId) } : null);
  }

  attach(_tx: TxHandle, args: { assetIds: string[]; targetType: StudyAssetTarget; targetId: string }): Promise<void> {
    for (const assetId of args.assetIds) {
      const exists = this.links.some((l) => l.assetId === assetId && l.targetType === args.targetType && l.targetId === args.targetId);
      if (!exists) this.links.push({ assetId, targetType: args.targetType, targetId: args.targetId });
    }
    return Promise.resolve();
  }

  detach(_tx: TxHandle, args: { targetType: StudyAssetTarget; targetId: string; assetIds?: string[] }): Promise<void> {
    for (let i = this.links.length - 1; i >= 0; i -= 1) {
      const l = this.links[i];
      if (l.targetType === args.targetType && l.targetId === args.targetId && (!args.assetIds || args.assetIds.includes(l.assetId))) {
        this.links.splice(i, 1);
      }
    }
    return Promise.resolve();
  }

  signThumbnails(assetIds: string[]): Promise<Map<string, string>> {
    return Promise.resolve(new Map(assetIds.filter((id) => this.assets.has(id)).map((id) => [id, `https://thumb.test/${id}`])));
  }
}
