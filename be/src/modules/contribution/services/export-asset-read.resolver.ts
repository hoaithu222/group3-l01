import type { AuthUser } from "../../../core/types/express";
import type { AssetTargetLinkRef, AssetTargetReadResolver } from "../../../shared/ports/asset-target-access.port";
import type { IContributionExportRepository } from "../repositories/contribution-export.repository.interface";
import type { ContributionAccess } from "./contribution-access";

/**
 * Quyền ĐỌC asset gắn `CONTRIBUTION_EXPORT` (đăng ký vào `shared/ports/asset-target-access.port` ở `registerContributionModule()`): chỉ khi bản xuất còn `READY`
 * và chưa quá hạn lưu, VÀ người xin đọc được BẢNG (`workspace.board.read` — OWNER/ADMIN/MEMBER; khách/người ngoài không). Khi đã đăng ký, CHỈ resolver này quyết
 * định cho link đó — kể cả chủ tệp (người yêu cầu xuất) mất quyền bảng thì cũng mất quyền tệp.
 */
export class ExportAssetReadResolver implements AssetTargetReadResolver {
  constructor(
    private readonly exports: IContributionExportRepository,
    private readonly access: ContributionAccess,
    private readonly now: () => Date = () => new Date()
  ) {}

  async canRead(user: AuthUser, link: AssetTargetLinkRef): Promise<boolean> {
    const rec = await this.exports.findById(link.targetId);
    if (!rec || rec.status !== "READY" || rec.expiresAt <= this.now()) return false;
    return this.access.canReadBoard(user, rec.boardId);
  }
}
