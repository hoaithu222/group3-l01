import type { ITaskAttachmentRepository, TaskAttachmentRow } from "../repositories/task-attachment.repository.interface";
import type { TxContext } from "../repositories/unit-of-work";

/** Phần `Asset` mà thẻ/bình luận cần để kiểm trước khi gắn (không kéo cả entity của `assets` vào module này). */
export interface AttachableAsset {
  id: string;
  ownerId: string;
  scope: string;
  variant: string;
  workspaceId: string | null;
  status: string;
  originalName: string;
}

export type AssetLinkTargetKind = "TASK" | "TASK_COMMENT";

/**
 * Cổng sang module `assets` (chỉ qua `@modules/assets/public`): kiểm asset trước khi gắn, gắn/gỡ `AssetLink`
 * (`scopeType WORKSPACE`, `scopeId` = workspaceId → quyền đọc theo `workspace.board.read`, PM2-24) và ký thumbnail.
 * Test dùng `InMemoryTaskAssetPort` thay vì mock từng hàm.
 */
export interface ITaskAssetPort {
  getForAttach(assetId: string): Promise<{ asset: AttachableAsset; linked: boolean } | null>;
  attach(
    tx: TxContext,
    args: { assetIds: string[]; targetType: AssetLinkTargetKind; targetId: string; workspaceId: string; actorId: string }
  ): Promise<void>;
  detach(tx: TxContext, args: { targetType: AssetLinkTargetKind; targetId: string; assetIds?: string[] }): Promise<void>;
  signThumbnails(assetIds: string[]): Promise<Map<string, { url: string; expiresAt: string }>>;
}

/** Test: kho asset trong bộ nhớ + ghi lại lời gọi gắn/gỡ để khẳng định. */
export class InMemoryTaskAssetPort implements ITaskAssetPort {
  readonly assets = new Map<string, AttachableAsset>();
  readonly attached: { assetId: string; targetType: AssetLinkTargetKind; targetId: string; actorId: string; createdAt: Date }[] = [];
  readonly detachCalls: { targetType: AssetLinkTargetKind; targetId: string; assetIds?: string[] }[] = [];

  /** Thêm asset READY hợp lệ để gắn vào thẻ (`scope: TASK`) — chỉnh trường để tạo ca lỗi. */
  seed(id: string, over: Partial<AttachableAsset> = {}): AttachableAsset {
    const asset: AttachableAsset = {
      id,
      ownerId: "",
      scope: "TASK",
      variant: "ORIGINAL",
      workspaceId: null,
      status: "READY",
      originalName: `${id}.pdf`,
      ...over,
    };
    this.assets.set(id, asset);
    return asset;
  }

  getForAttach(assetId: string) {
    const asset = this.assets.get(assetId);
    const linked = this.attached.some((a) => a.assetId === assetId);
    return Promise.resolve(asset ? { asset, linked } : null);
  }

  attach(_tx: TxContext, args: { assetIds: string[]; targetType: AssetLinkTargetKind; targetId: string; actorId: string }): Promise<void> {
    for (const assetId of args.assetIds) {
      this.attached.push({ assetId, targetType: args.targetType, targetId: args.targetId, actorId: args.actorId, createdAt: new Date() });
    }
    return Promise.resolve();
  }

  detach(_tx: TxContext, args: { targetType: AssetLinkTargetKind; targetId: string; assetIds?: string[] }): Promise<void> {
    this.detachCalls.push(args);
    for (let i = this.attached.length - 1; i >= 0; i--) {
      const a = this.attached[i];
      if (a.targetType === args.targetType && a.targetId === args.targetId && (!args.assetIds || args.assetIds.includes(a.assetId))) {
        this.attached.splice(i, 1);
      }
    }
    return Promise.resolve();
  }

  signThumbnails(assetIds: string[]) {
    return Promise.resolve(
      new Map(assetIds.map((id) => [id, { url: `https://thumb.test/${id}`, expiresAt: new Date(Date.now() + 60_000).toISOString() }]))
    );
  }
}

/** Test: đọc danh sách đính kèm từ chính kho của `InMemoryTaskAssetPort` (gắn/gỡ qua port → thấy ngay ở đây). */
export class InMemoryTaskAttachmentRepository implements ITaskAttachmentRepository {
  constructor(private readonly port: InMemoryTaskAssetPort) {}

  private rows(targetType: AssetLinkTargetKind, targetId: string): TaskAttachmentRow[] {
    return this.port.attached
      .filter((a) => a.targetType === targetType && a.targetId === targetId)
      .flatMap((a) => {
        const asset = this.port.assets.get(a.assetId);
        return asset && asset.status === "READY"
          ? [
              {
                assetId: asset.id,
                originalName: asset.originalName,
                mime: "application/pdf",
                size: 1024,
                kind: "FILE",
                hasThumbnail: false,
                attachedBy: a.actorId,
                createdAt: a.createdAt,
              },
            ]
          : [];
      });
  }

  async listForTask(taskId: string): Promise<TaskAttachmentRow[]> {
    return this.rows("TASK", taskId);
  }

  async listForComments(commentIds: string[]): Promise<Map<string, TaskAttachmentRow[]>> {
    return new Map(commentIds.map((id) => [id, this.rows("TASK_COMMENT", id)] as const).filter(([, rows]) => rows.length > 0));
  }

  async findTaskLink(taskId: string, assetId: string): Promise<{ assetId: string; createdBy: string } | null> {
    const link = this.port.attached.find((a) => a.targetType === "TASK" && a.targetId === taskId && a.assetId === assetId);
    return link ? { assetId, createdBy: link.actorId } : null;
  }
}
