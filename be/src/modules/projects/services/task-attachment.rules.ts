import { AppError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { AssetLinkTargetKind, AttachableAsset, ITaskAssetPort } from "./task-asset.port";

/** Tệp hợp lệ để gắn: đúng scope, bản gốc, READY, của CHÍNH người gắn, thuộc đúng workspace của thẻ. */
function isAttachable(asset: AttachableAsset, userId: string, workspaceId: string, scope: AssetLinkTargetKind): boolean {
  return (
    asset.scope === scope &&
    asset.variant === "ORIGINAL" &&
    asset.status === "READY" &&
    asset.ownerId === userId &&
    asset.workspaceId === workspaceId
  );
}

/**
 * `TASK_004` (400) khi BẤT KỲ tệp nào chưa READY / không phải của mình / sai scope-workspace / đã gắn nơi khác / không
 * tồn tại. Kiểm TRƯỚC transaction (đọc `assets`); `AssetLinkService.attach` trong transaction kiểm lại READY + chủ sở hữu.
 */
export async function assertAttachable(
  port: ITaskAssetPort,
  userId: string,
  assetIds: string[],
  scope: AssetLinkTargetKind,
  workspaceId: string
): Promise<AttachableAsset[]> {
  if (assetIds.length === 0) return [];
  const found = await Promise.all(assetIds.map((id) => port.getForAttach(id)));
  const invalid = assetIds.filter((_, i) => {
    const f = found[i];
    return !f || f.linked || !isAttachable(f.asset, userId, workspaceId, scope);
  });
  if (invalid.length > 0) {
    throw new AppError(ErrorMessages[ErrorCode.TASK_004], 400, ErrorCode.TASK_004, { assetIds: invalid });
  }
  return found.map((f) => (f as { asset: AttachableAsset }).asset);
}
