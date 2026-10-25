import type { AuthUser } from "../../../core/types/express";
import type { AssetTargetLinkRef, AssetTargetReadResolver } from "../../../shared/ports/asset-target-access.port";
import type { IStudyItemRepository } from "../repositories/study-item.repository.interface";
import type { IStudySetRepository } from "../repositories/study-set.repository.interface";
import type { StudySetAccess } from "./study-set-access";

/**
 * Quyền ĐỌC asset gắn `STUDY_ITEM`/`STUDY_SET_COVER` = quyền đọc NỘI DUNG bộ hiện tại (`StudySetAccess.canView`) — đăng ký
 * vào `AssetAccessService` qua `shared/ports/asset-target-access.port` (module `assets` không import `study`). Phạm vi bộ
 * đổi theo thời gian nên link luôn `scopeType NONE` và quyền tính LẠI mỗi lần: bộ chuyển PRIVATE/ẩn/xoá → người khác 404 ngay
 * (ST-04, ST-19). Bản sao có `AssetLink` riêng (trỏ mục của bản sao) nên vẫn đọc được ảnh khi bộ gốc đổi phạm vi (ST-18).
 */
export class StudyAssetReadResolver implements AssetTargetReadResolver {
  constructor(
    private readonly sets: IStudySetRepository,
    private readonly items: IStudyItemRepository,
    private readonly access: StudySetAccess
  ) {}

  async canRead(user: AuthUser, link: AssetTargetLinkRef): Promise<boolean> {
    const setId = link.targetType === "STUDY_SET_COVER" ? link.targetId : await this.items.findSetId(link.targetId);
    if (!setId) return false;
    const set = await this.sets.findById(setId);
    return set ? this.access.canView(user, set) : false;
  }
}
