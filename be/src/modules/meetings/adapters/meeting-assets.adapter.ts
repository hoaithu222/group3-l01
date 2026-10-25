/**
 * ĐIỂM NỐI của `meetings` với module `assets` cho biên bản/ghi hình (p2-06): chỉ dùng barrel công khai `@modules/assets/public`
 * (`AssetLinkService`, `AssetLifecycleService`, `PrismaAssetLinkRepository`) — KHÔNG chạm bảng `Asset`/`AssetLink` trực tiếp. Phần còn lại của `meetings`
 * chỉ biết cổng `MeetingAssetsPort`.
 */
import {
  PrismaAssetLinkRepository,
  createAssetLifecycleService,
  createAssetLinkService,
  type AssetLifecycleService,
  type AssetLinkService,
  type IAssetLinkRepository,
} from "../../assets/public";
import type { TxHandle } from "../repositories/tx";
import type { MeetingAssetInfo, MeetingAssetsPort, MeetingAssetTarget, RegisterRecordingAssetInput } from "../services/meeting-assets.port";

export class AssetsPortAdapter implements MeetingAssetsPort {
  constructor(
    private readonly links: AssetLinkService = createAssetLinkService(),
    private readonly lifecycle: AssetLifecycleService = createAssetLifecycleService(),
    private readonly linkRepo: IAssetLinkRepository = new PrismaAssetLinkRepository()
  ) {}

  async getMany(assetIds: string[]): Promise<MeetingAssetInfo[]> {
    const found = await Promise.all([...new Set(assetIds)].map((id) => this.lifecycle.getForAttach(id)));
    return found.flatMap((f) =>
      f
        ? [{ id: f.asset.id, ownerId: f.asset.ownerId, scope: f.asset.scope, status: f.asset.status, workspaceId: f.asset.workspaceId, originalName: f.asset.originalName, mime: f.asset.mime, size: f.asset.size }]
        : []
    );
  }

  async linkedAssetIds(target: MeetingAssetTarget, targetId: string): Promise<string[]> {
    const rows = await this.linkRepo.listByTarget(target, targetId);
    return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((r) => r.assetId);
  }

  attach(tx: TxHandle, i: { assetId: string; target: MeetingAssetTarget; targetId: string; meetingId: string; actorId: string }): Promise<void> {
    return this.links.attach(tx, { assetIds: [i.assetId], targetType: i.target, targetId: i.targetId, scopeType: "MEETING", scopeId: i.meetingId, actorId: i.actorId });
  }

  detach(tx: TxHandle, i: { assetId: string; target: MeetingAssetTarget; targetId: string }): Promise<void> {
    return this.links.detach(tx, { targetType: i.target, targetId: i.targetId, assetIds: [i.assetId] });
  }

  registerRecording(tx: TxHandle, i: RegisterRecordingAssetInput): Promise<{ assetId: string }> {
    return this.lifecycle.registerStoredObject(tx, {
      scope: "RECORDING",
      ownerId: i.ownerId,
      workspaceId: i.workspaceId,
      kind: "VIDEO",
      mime: "video/mp4",
      fileName: i.fileName,
      storageKey: i.storageKey,
      size: i.size,
      durationMs: i.durationMs,
    });
  }

  markDeleted(tx: TxHandle, assetId: string): Promise<void> {
    return this.lifecycle.markDeleted(tx, assetId);
  }
}
