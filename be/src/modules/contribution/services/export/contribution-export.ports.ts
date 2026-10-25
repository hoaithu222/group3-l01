import type { AuthUser } from "../../../../core/types/express";
import {
  createAssetLinkService,
  createAssetServerFileService,
  createAssetUrlService,
  type AssetLinkService,
  type AssetServerFilePort,
  type AssetUrlPort,
} from "../../../assets/public";
import type { TxHandle } from "../../repositories/tx";
import { renderContributionPdf, type PdfReportInput } from "./contribution-pdf.renderer";

/** Cổng asset của báo cáo: tạo PDF từ buffer (scope `REPORT`), gắn/gỡ `AssetLink CONTRIBUTION_EXPORT`, ký URL tải ≤ 60 s. */
export interface IContribAssets {
  createPdf(input: { ownerId: string; workspaceId: string; fileName: string; buffer: Buffer }): Promise<{ id: string }>;
  attach(tx: TxHandle, input: { assetId: string; exportId: string; workspaceId: string; actorId: string }): Promise<void>;
  detachAll(tx: TxHandle, exportId: string): Promise<void>;
  /** TỰ kiểm quyền đọc asset theo `AssetLink` (resolver của module này) — người không đọc được bảng nhận `404`. */
  signedUrl(assetId: string, user: AuthUser): Promise<{ url: string; expiresAt: string }>;
}

export class PublicContribAssets implements IContribAssets {
  private readonly files: AssetServerFilePort = createAssetServerFileService();
  private readonly links: AssetLinkService = createAssetLinkService();
  private readonly urls: AssetUrlPort = createAssetUrlService();

  async createPdf(input: { ownerId: string; workspaceId: string; fileName: string; buffer: Buffer }): Promise<{ id: string }> {
    const asset = await this.files.createFromBuffer({ scope: "REPORT", ownerId: input.ownerId, workspaceId: input.workspaceId, mime: "application/pdf", fileName: input.fileName, buffer: input.buffer });
    return { id: asset.id };
  }

  attach(tx: TxHandle, input: { assetId: string; exportId: string; workspaceId: string; actorId: string }): Promise<void> {
    return this.links.attach(tx, {
      assetIds: [input.assetId],
      targetType: "CONTRIBUTION_EXPORT",
      targetId: input.exportId,
      scopeType: "WORKSPACE",
      scopeId: input.workspaceId,
      actorId: input.actorId,
    });
  }

  detachAll(tx: TxHandle, exportId: string): Promise<void> {
    return this.links.detachAll(tx, { targetType: "CONTRIBUTION_EXPORT", targetId: exportId });
  }

  signedUrl(assetId: string, user: AuthUser): Promise<{ url: string; expiresAt: string }> {
    return this.urls.getUrl(assetId, user, { variant: "ORIGINAL", disposition: "inline" });
  }
}

/** Bộ dựng PDF (đồng bộ, CPU nhẹ) — cổng để test thay bằng bản giả khi cần. */
export interface IContribPdf {
  render(input: PdfReportInput, at: Date): Buffer;
}

export class DefaultContribPdf implements IContribPdf {
  render(input: PdfReportInput, at: Date): Buffer {
    return renderContributionPdf(input, at);
  }
}
