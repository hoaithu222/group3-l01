import { createAssetLifecycleService, createAssetLinkService, createAssetUrlService } from "../../assets/public";
import type { IWhiteboardAssetPort } from "./whiteboard-ports";
import type { TxHandle } from "../repositories/tx";

/**
 * Ảnh thu nhỏ bảng trắng: kiểm asset qua `AssetLifecycleService.getForAttach`, thay link `AssetLink{WHITEBOARD}` bằng `AssetLinkService.replace` (gỡ link cũ + gắn mới trong CÙNG
 * transaction) và ký URL thumbnail bằng `AssetUrlPort.signThumbnails` (đúng 2 truy vấn cho cả trang danh sách).
 * ⚠ `replace` gỡ MỌI link `WHITEBOARD` của bảng: ảnh chèn vào bảng (P1, phần tử `image`) PHẢI dùng `attach` với target/scope khác, không đi qua đây — nếu không sẽ gỡ nhầm ảnh chèn.
 */
export class PrismaWhiteboardAssetPort implements IWhiteboardAssetPort {
  private readonly lifecycle = createAssetLifecycleService();
  private readonly links = createAssetLinkService();
  private readonly urls = createAssetUrlService();

  async find(assetId: string) {
    const found = await this.lifecycle.getForAttach(assetId);
    return found ? { scope: found.asset.scope, kind: found.asset.kind, status: found.asset.status, ownerId: found.asset.ownerId } : null;
  }

  replaceThumbnail(tx: TxHandle, input: { assetId: string; whiteboardId: string; workspaceId: string; actorId: string }): Promise<void> {
    return this.links.replace(tx, {
      targetType: "WHITEBOARD",
      targetId: input.whiteboardId,
      assetId: input.assetId,
      scopeType: "WORKSPACE",
      scopeId: input.workspaceId,
      actorId: input.actorId,
    });
  }

  async signThumbnails(assetIds: string[]): Promise<Map<string, string>> {
    const signed = await this.urls.signThumbnails(assetIds);
    return new Map([...signed].map(([id, v]) => [id, v.url]));
  }
}
