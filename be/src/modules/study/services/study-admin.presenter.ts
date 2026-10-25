import type { StudySet } from "../entities/study-set.interface";
import { toSummaryDto, type PresentContext, type StudySetSummaryDto } from "./study-set.presenter";

/** Bộ học dưới góc nhìn quản trị — metadata + số liệu kiểm duyệt (KHÔNG nội dung mục; nội dung qua `GET /admin/study-sets/:id/items`, chỉ bộ PUBLIC). */
export interface AdminStudySetDto extends StudySetSummaryDto {
  itemTypesMask: number;
  reportedCount: number;
  hiddenReason: string | null;
  hiddenBy: string | null;
  hiddenAt: Date | null;
  /** `true` chỉ khi PUBLIC — bộ WORKSPACE chỉ xem thông tin chung (admin-plan §3.4). */
  canViewContent: boolean;
}

export function toAdminStudySetDto(set: StudySet, ctx: PresentContext): AdminStudySetDto {
  return {
    ...toSummaryDto(set, ctx),
    itemTypesMask: set.itemTypesMask,
    reportedCount: set.reportedCount,
    hiddenReason: set.hiddenReason,
    hiddenBy: set.hiddenBy,
    hiddenAt: set.hiddenAt,
    canViewContent: set.visibility === "PUBLIC",
  };
}
