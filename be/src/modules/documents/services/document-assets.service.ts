import { permissionService } from "../../../core/permission";
import { AppError, ScopeNotFoundError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { AuthUser } from "../../../core/types/express";
import type { IDocumentRepository } from "../repositories/document.repository.interface";
import type { ITxRunner } from "../repositories/tx";
import type { IDocumentAssetPort } from "./document-ports";

/** Ảnh chèn vào tài liệu chỉ nhận JPEG/PNG/WebP/GIF do người dùng tải lên với scope `DOC` (asset `IMAGE`, `READY`, của chính người chèn). */
export class DocumentAssetsService {
  constructor(
    private readonly documents: Pick<IDocumentRepository, "findById">,
    private readonly assets: IDocumentAssetPort,
    private readonly tx: ITxRunner
  ) {}

  /**
   * `POST /documents/:id/assets { assetId }` — gắn `AssetLink{DOCUMENT}` để MỌI người đọc được tài liệu lấy URL ký (`GET /assets/:id/url`); nội dung Yjs chỉ
   * lưu `assetId` (không URL). Idempotent (upsert theo `(assetId, targetType, targetId)`).
   */
  async attachImage(actor: AuthUser, documentId: string, assetId: string): Promise<{ documentId: string; assetId: string }> {
    await permissionService.assert(actor, "document.edit", { type: "DOCUMENT", id: documentId });
    const doc = await this.documents.findById(documentId);
    if (!doc) throw new ScopeNotFoundError();

    const asset = await this.assets.find(assetId);
    if (!asset) throw new ScopeNotFoundError();
    if (asset.ownerId !== actor.id) throw new AppError(ErrorMessages[ErrorCode.ASSET_005], 403, ErrorCode.ASSET_005);
    if (asset.scope !== "DOC" || asset.kind !== "IMAGE") throw new AppError(ErrorMessages[ErrorCode.ASSET_001], 415, ErrorCode.ASSET_001);
    if (asset.status !== "READY") throw new AppError(ErrorMessages[ErrorCode.ASSET_003], 409, ErrorCode.ASSET_003);

    await this.tx.run((tx) => this.assets.attach(tx, { assetId, documentId, workspaceId: doc.workspaceId, actorId: actor.id }));
    return { documentId, assetId };
  }
}
