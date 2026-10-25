import type { Prisma } from "@prisma/client";
import type { AuthUser } from "../../../core/types/express";
import { AppError, NotFoundError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { AssetLinkTargetType, AssetLinkScopeType, AssetScope, AssetStatusValue } from "../entities/asset.interface";
import type { AssetAccessService } from "./asset-access.service";

/** Đích chỉ nhận `kind IMAGE` (be.md §5.5). */
const IMAGE_ONLY_TARGETS = new Set<AssetLinkTargetType>([
  "USER_AVATAR",
  "WORKSPACE_AVATAR",
  "WORKSPACE_COVER",
  "CONVERSATION_AVATAR",
  "COMPANY_LOGO",
]);

export interface AttachInput {
  assetIds: string[];
  targetType: AssetLinkTargetType;
  targetId: string;
  scopeType: AssetLinkScopeType;
  scopeId?: string;
  actorId: string;
  /** Chuyển tiếp (forward) — asset không thuộc `actorId` nhưng actor ĐỌC ĐƯỢC nó (vd forward tin nhắn). */
  allowForeignReadable?: boolean;
  /**
   * Chỉ nhận asset tải lên với các scope này (vd ảnh nhóm: `["AVATAR"]` — allowlist ảnh + trần 2 MiB của `mimePolicy`).
   * Sai scope → 415 `ASSET_001`. Bỏ trống = không kiểm (hành vi cũ).
   */
  allowedScopes?: readonly AssetScope[];
  /**
   * `targetId` vừa được tạo trong CHÍNH transaction này (vd tin nhắn mới) ⇒ chắc chắn chưa có link nào: ghi 1 lệnh `createMany` thay vì mỗi tệp một `upsert`
   * (mỗi upsert trên Mongo là 1–2 vòng DB tuần tự trong transaction — 5 ảnh = 5–10 vòng).
   */
  freshTarget?: boolean;
}

export interface DetachInput {
  targetType: AssetLinkTargetType;
  targetId: string;
  /** Bỏ trống = gỡ MỌI asset đang gắn vào target này (dùng bởi `detachAll`). */
  assetIds?: string[];
}

export interface ReplaceInput {
  targetType: AssetLinkTargetType;
  targetId: string;
  assetId: string;
  scopeType: AssetLinkScopeType;
  scopeId?: string;
  actorId: string;
  /** Như `AttachInput.allowedScopes`. */
  allowedScopes?: readonly AssetScope[];
}

/**
 * `AssetLinkService` — gắn/gỡ asset vào đối tượng nghiệp vụ (be.md §5.5).
 * MỌI method nhận `tx: Prisma.TransactionClient` do MODULE GỌI truyền vào
 * (vd module message gửi tin: tạo Message + `attach` trong CÙNG transaction)
 * — đi thẳng `tx.asset.*`/`tx.assetLink.*`, KHÔNG qua `IAssetRepository`/
 * `IAssetLinkRepository` (2 repo đó chỉ đọc qua singleton `prisma`, không
 * nhận `tx`; xem comment ở 2 file đó). Đây là NGOẠI LỆ CÓ CHỦ ĐÍCH giống
 * `UserAnonymizer`/`UserService.requestDeletion` đã áp dụng cho thao tác
 * xuyên collection cần ATOMIC với nghiệp vụ gọi nó — không phải mẫu chung
 * cho service khác trong module `assets`.
 *
 * Export qua `@modules/assets/public` — module khác import từ đó (be.md §1).
 */
export class AssetLinkService {
  constructor(private readonly access: AssetAccessService) {}

  async attach(tx: Prisma.TransactionClient, input: AttachInput): Promise<void> {
    if (input.assetIds.length === 0) return;
    const uniqueIds = Array.from(new Set(input.assetIds));
    const assets = await tx.asset.findMany({ where: { id: { in: uniqueIds } } });
    if (assets.length !== uniqueIds.length) throw new NotFoundError("Không tìm thấy tệp");

    for (const asset of assets) {
      if (asset.status !== "READY") {
        throw new AppError("Tệp chưa xử lý xong", 409, ErrorCode.ASSET_003);
      }
      if (asset.ownerId !== input.actorId) {
        const actor: AuthUser = { id: input.actorId, email: "" };
        const readable =
          input.allowForeignReadable === true &&
          (await this.access.canRead(actor, {
            id: asset.id,
            ownerId: asset.ownerId,
            status: asset.status as AssetStatusValue,
            parentAssetId: asset.parentAssetId,
          }));
        if (!readable) {
          throw new AppError("Tệp không thuộc quyền sử dụng của bạn", 403, ErrorCode.ASSET_005);
        }
      }
      if (IMAGE_ONLY_TARGETS.has(input.targetType) && asset.kind !== "IMAGE") {
        throw new AppError("Loại tệp không hợp lệ cho mục đích này", 415, ErrorCode.ASSET_001);
      }
      if (input.allowedScopes && !input.allowedScopes.includes(asset.scope as AssetScope)) {
        throw new AppError("Loại tệp không hợp lệ cho mục đích này", 415, ErrorCode.ASSET_001);
      }
    }

    if (input.freshTarget) {
      await tx.assetLink.createMany({
        data: assets.map((asset) => ({
          assetId: asset.id,
          targetType: input.targetType,
          targetId: input.targetId,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          createdBy: input.actorId,
        })),
      });
      return;
    }

    // Upsert — idempotent theo `@@unique([assetId, targetType, targetId])` (gọi lại không nhân bản link).
    for (const asset of assets) {
      await tx.assetLink.upsert({
        where: {
          assetId_targetType_targetId: {
            assetId: asset.id,
            targetType: input.targetType,
            targetId: input.targetId,
          },
        },
        create: {
          assetId: asset.id,
          targetType: input.targetType,
          targetId: input.targetId,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          createdBy: input.actorId,
        },
        update: {},
      });
    }
  }

  /** Gỡ 1 phần (`assetIds` cho trước) hoặc TOÀN BỘ link của 1 target. */
  async detach(tx: Prisma.TransactionClient, input: DetachInput): Promise<void> {
    const where: Prisma.AssetLinkWhereInput = {
      targetType: input.targetType,
      targetId: input.targetId,
      ...(input.assetIds && input.assetIds.length > 0 && { assetId: { in: input.assetIds } }),
    };
    const links = await tx.assetLink.findMany({ where, select: { assetId: true } });
    if (links.length === 0) return;
    await tx.assetLink.deleteMany({ where });
    await this.markUnlinked(tx, links.map((l) => l.assetId));
  }

  /** Gỡ MỌI asset đang gắn vào 1 target — dùng khi xoá/ẩn danh hoá đối tượng (vd `UserAnonymizer`, p0-13 enroll). */
  async detachAll(tx: Prisma.TransactionClient, input: { targetType: AssetLinkTargetType; targetId: string }): Promise<void> {
    await this.detach(tx, input);
  }

  /** Thay asset khác cho CÙNG target (avatar) — gỡ link cũ rồi gắn link mới trong CÙNG transaction. */
  async replace(tx: Prisma.TransactionClient, input: ReplaceInput): Promise<void> {
    await this.detach(tx, { targetType: input.targetType, targetId: input.targetId });
    await this.attach(tx, {
      assetIds: [input.assetId],
      targetType: input.targetType,
      targetId: input.targetId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      actorId: input.actorId,
      allowedScopes: input.allowedScopes,
    });
  }

  /** `lastUnlinkedAt` — mốc `assets.cleanup` dùng để cho asset vừa mất hết link 1 khoảng ân hạn trước khi xoá (be.md §5.7). */
  private async markUnlinked(tx: Prisma.TransactionClient, assetIds: string[]): Promise<void> {
    const now = new Date();
    await Promise.all(
      Array.from(new Set(assetIds)).map((id) => tx.asset.updateMany({ where: { id }, data: { lastUnlinkedAt: now } }))
    );
  }
}
