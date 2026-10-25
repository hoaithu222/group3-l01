import { ForbiddenError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import type { ReportPort } from "../../../shared/ports/report.port";
import type { AdminItemsQueryDto } from "../dtos";
import type { StudySet } from "../entities/study-set.interface";
import { studyErrors } from "../study.errors";
import { toAdminStudySetDto, type AdminStudySetDto } from "./study-admin.presenter";
import { toItemDto, toSetDto, type StudyItemDto, type StudySetDetailDto } from "./study-set.presenter";
import { STUDY_SET_REPORT_TARGET } from "./study-report.service";
import { buildPresentContext, isSrEnrolled, loadSet, withClock, type ResolvedStudyDeps, type StudyDeps } from "./study.deps";

/** Cổng audit — `AuditService` (module audit-log) thoả mãn qua structural typing (giống `ModerationAudit`). */
export interface StudyAudit {
  record(input: {
    actorId: string;
    actorRole?: string;
    action: string;
    targetType: string;
    targetId: string;
    workspaceId?: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export type { AdminStudySetDto } from "./study-admin.presenter";

/**
 * Mục học cho admin: kèm thumbnail ký (≤ 60 s) của ảnh mặt trước/sau và ảnh từng lựa chọn (`null` = không có ảnh / chưa xử lý xong), không cần quyền đọc asset.
 * Chỉ bộ PUBLIC (`adminItems` đã từ chối bộ WORKSPACE/PRIVATE), chỉ thumbnail, không bản gốc.
 */
export type AdminStudyItemDto = Omit<StudyItemDto, "options"> & {
  options: Array<StudyItemDto["options"][number] & { mediaThumbUrl: string | null }>;
  frontMediaThumbUrl: string | null;
  backMediaThumbUrl: string | null;
};

export interface AdminItemsPage {
  data: AdminStudyItemDto[];
  meta: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean };
}

/**
 * Ẩn/khôi phục bộ học (be.md §4–§5): OWNER/ADMIN nhóm ẩn bộ WORKSPACE (`/study-sets/:id/hide|unhide`), quản trị nền tảng
 * ẩn/khôi phục bộ PUBLIC (`/admin/study-sets/:id/…`, `moderation:update`). Mọi thao tác ghi audit; ẩn còn ĐÓNG các báo cáo mở
 * của bộ (p1-08) với kết quả `CONTENT_REMOVED`. Ẩn → người khác 404, tác giả thấy `status HIDDEN` + lý do, bộ rời khám phá.
 */
export class StudySetModerationService {
  private readonly d: ResolvedStudyDeps;

  constructor(
    deps: StudyDeps,
    private readonly audit: StudyAudit,
    private readonly reports: ReportPort
  ) {
    this.d = withClock(deps);
  }

  // ── OWNER/ADMIN nhóm ────────────────────────────────────────────────────────

  async hide(user: AuthUser, id: string, reason: string): Promise<StudySetDetailDto> {
    const set = await loadSet(this.d, id);
    const perms = await this.d.access.resolve(user, set);
    if (!perms.hide) throw this.denied(perms.meta, "Chỉ OWNER/ADMIN nhóm được ẩn bộ học của nhóm");
    const hidden = await this.markHidden(set, user, reason);
    await this.auditAndClose(user, hidden, "study-set.hide", "SCOPE", reason, true);
    return this.detail(hidden, user);
  }

  async unhide(user: AuthUser, id: string, reason: string): Promise<StudySetDetailDto> {
    const set = await loadSet(this.d, id);
    const perms = await this.d.access.resolve(user, set);
    if (!perms.unhide) throw this.denied(perms.meta, "Chỉ OWNER/ADMIN nhóm được khôi phục bộ học của nhóm");
    const restored = await this.markRestored(set);
    await this.auditAndClose(user, restored, "study-set.unhide", "SCOPE", reason, false);
    return this.detail(restored, user);
  }

  // ── Quản trị nền tảng (`moderation:view|update`) ────────────────────────────

  async adminGet(id: string): Promise<AdminStudySetDto> {
    return this.toAdminDto(await this.loadForAdmin(id));
  }

  /** Nội dung CHỈ với bộ PUBLIC (kể cả đã ẩn — để cân nhắc khôi phục); bộ WORKSPACE → 403, PRIVATE/đã xoá → 404. */
  async adminItems(id: string, query: AdminItemsQueryDto): Promise<AdminItemsPage> {
    const set = await this.loadForAdmin(id);
    if (set.visibility !== "PUBLIC") throw new ForbiddenError("Chỉ xem được nội dung của bộ học công khai");
    const all = await this.d.items.listBySet(set.id);
    const start = (query.page - 1) * query.limit;
    const totalPages = Math.max(1, Math.ceil(all.length / query.limit));
    const pageItems = all.slice(start, start + query.limit).map(toItemDto);
    // MỘT lượt ký thumbnail cho cả trang (mặt trước/sau + ảnh lựa chọn), không N+1.
    const imageIds = new Set(pageItems.flatMap((it) => [it.frontMediaAssetId, it.backMediaAssetId, ...it.options.map((o) => o.mediaAssetId)]).filter((id): id is string => !!id));
    const thumbs = imageIds.size > 0 ? await this.d.assets.signThumbnails([...imageIds]) : new Map<string, string>();
    const thumbOf = (id: string | null): string | null => (id ? (thumbs.get(id) ?? null) : null);
    return {
      data: pageItems.map((item) => ({
        ...item,
        options: item.options.map((o) => ({ ...o, mediaThumbUrl: thumbOf(o.mediaAssetId) })),
        frontMediaThumbUrl: thumbOf(item.frontMediaAssetId),
        backMediaThumbUrl: thumbOf(item.backMediaAssetId),
      })),
      meta: { page: query.page, limit: query.limit, total: all.length, totalPages, hasNext: query.page < totalPages, hasPrev: query.page > 1 },
    };
  }

  async adminHide(actor: AuthUser, id: string, reason: string): Promise<AdminStudySetDto> {
    const set = await this.loadForAdmin(id);
    if (set.visibility !== "PUBLIC") throw new ForbiddenError("Quản trị nền tảng chỉ ẩn bộ học công khai");
    const hidden = await this.markHidden(set, actor, reason);
    await this.auditAndClose(actor, hidden, "study-set.hide", "PLATFORM", reason, true);
    return this.toAdminDto(hidden);
  }

  async adminRestore(actor: AuthUser, id: string, reason: string): Promise<AdminStudySetDto> {
    const set = await this.loadForAdmin(id);
    if (set.visibility !== "PUBLIC") throw new ForbiddenError("Quản trị nền tảng chỉ khôi phục bộ học công khai");
    const restored = await this.markRestored(set);
    await this.auditAndClose(actor, restored, "study-set.restore", "PLATFORM", reason, false);
    return this.toAdminDto(restored);
  }

  // ── nội bộ ──────────────────────────────────────────────────────────────────

  private denied(canSee: boolean, message: string): Error {
    return canSee ? new ForbiddenError(message) : studyErrors.notFound();
  }

  /** PRIVATE và đã xoá không thuộc phạm vi quản trị nền tảng — 404 (báo cáo không áp dụng cho bộ riêng tư). */
  private async loadForAdmin(id: string): Promise<StudySet> {
    const set = await loadSet(this.d, id);
    if (set.status === "DELETED" || set.visibility === "PRIVATE") throw studyErrors.notFound();
    return set;
  }

  private async markHidden(set: StudySet, by: AuthUser, reason: string): Promise<StudySet> {
    const hidden = await this.d.sets.updateIf(
      set.id,
      { statusIn: ["ACTIVE"] },
      { status: "HIDDEN", hiddenReason: reason, hiddenBy: by.id, hiddenAt: this.d.now() }
    );
    if (!hidden) throw (await this.d.sets.findById(set.id))?.status === "HIDDEN" ? studyErrors.hidden() : studyErrors.notFound();
    return hidden;
  }

  private async markRestored(set: StudySet): Promise<StudySet> {
    const restored = await this.d.sets.updateIf(
      set.id,
      { statusIn: ["HIDDEN"] },
      { status: "ACTIVE", hiddenReason: null, hiddenBy: null, hiddenAt: null }
    );
    if (!restored) throw studyErrors.notFound();
    return restored;
  }

  private async auditAndClose(
    actor: AuthUser,
    set: StudySet,
    action: string,
    level: "SCOPE" | "PLATFORM",
    reason: string,
    closeReports: boolean
  ): Promise<void> {
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action,
      targetType: "StudySet",
      targetId: set.id,
      workspaceId: set.workspaceId ?? undefined,
      reason,
      metadata: { level, visibility: set.visibility, ownerId: set.ownerId },
    });
    if (closeReports) {
      await this.reports.closeOpenByTarget({
        targetType: STUDY_SET_REPORT_TARGET,
        targetId: set.id,
        actor: { id: actor.id, role: actor.role },
        resolution: "CONTENT_REMOVED",
        level,
        reason,
      });
    }
  }

  private async detail(set: StudySet, user: AuthUser): Promise<StudySetDetailDto> {
    const perms = await this.d.access.resolve(user, set);
    const [ctx, srEnrolled] = await Promise.all([buildPresentContext(this.d, [set]), isSrEnrolled(this.d, user.id, set.id)]);
    return {
      ...toSetDto(set, ctx, user.id, perms),
      srEnrolled,
      myPermissions: { edit: perms.edit, delete: perms.delete, duplicate: perms.duplicate, report: perms.report, hide: perms.hide, unhide: perms.unhide },
    };
  }

  private async toAdminDto(set: StudySet): Promise<AdminStudySetDto> {
    return toAdminStudySetDto(set, await buildPresentContext(this.d, [set]));
  }
}
