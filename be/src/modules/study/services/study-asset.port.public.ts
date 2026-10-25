import {
  createAssetLifecycleService,
  createAssetLinkService,
  createAssetUrlService,
  type AssetLifecycleService,
  type AssetLinkService,
  type AssetUrlPort,
} from "../../assets/public";
import type { TxHandle } from "../repositories/tx";
import type { IStudyAssetPort, StudyAssetTarget } from "./study-asset.port";

/**
 * Cài đặt thật của `IStudyAssetPort` — CHỈ đi qua `@modules/assets/public`. Link luôn `scopeType NONE`: quyền đọc do
 * resolver `STUDY_ITEM`/`STUDY_SET_COVER` (đăng ký từ module này qua `shared/ports/asset-target-access.port`) quyết định
 * theo phạm vi HIỆN TẠI của bộ; nơi chưa đăng ký resolver (worker) rơi về "chỉ chủ asset" — fail-closed.
 */
export class PublicStudyAssetPort implements IStudyAssetPort {
  constructor(
    private readonly lifecycle: AssetLifecycleService = createAssetLifecycleService(),
    private readonly links: AssetLinkService = createAssetLinkService(),
    private readonly urls: AssetUrlPort = createAssetUrlService()
  ) {}

  async get(assetId: string) {
    const found = await this.lifecycle.getForAttach(assetId);
    if (!found) return null;
    const { id, ownerId, scope, variant, kind, status } = found.asset;
    return { asset: { id, ownerId, scope, variant, kind, status }, linked: found.linked };
  }

  attach(
    tx: TxHandle,
    args: { assetIds: string[]; targetType: StudyAssetTarget; targetId: string; actorId: string; foreignReadable?: boolean }
  ): Promise<void> {
    return this.links.attach(tx, {
      assetIds: args.assetIds,
      targetType: args.targetType,
      targetId: args.targetId,
      scopeType: "NONE",
      actorId: args.actorId,
      allowForeignReadable: args.foreignReadable,
    });
  }

  detach(tx: TxHandle, args: { targetType: StudyAssetTarget; targetId: string; assetIds?: string[] }): Promise<void> {
    return this.links.detach(tx, { targetType: args.targetType, targetId: args.targetId, assetIds: args.assetIds });
  }

  async signThumbnails(assetIds: string[]): Promise<Map<string, string>> {
    const signed = await this.urls.signThumbnails(assetIds);
    return new Map([...signed.entries()].map(([id, s]) => [id, s.url]));
  }
}
