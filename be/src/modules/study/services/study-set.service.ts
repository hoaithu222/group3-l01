import { ForbiddenError, VersionConflictError } from "../../../core/exceptions";
import { newObjectId } from "../../../core/utils/object-id";
import { normalizeSearch } from "../../../core/utils/normalize";
import type { AuthUser } from "../../../core/types/express";
import type { CreateSetDto, PatchSetDto } from "../dtos";
import type { StudySet, StudySetPatch } from "../entities/study-set.interface";
import { studyErrors } from "../study.errors";
import type { StudyAssetInfo } from "./study-asset.port";
import { isUsableAsset } from "./study-item.validator";
import { studyLimitsOf } from "./study-limits";
import type { StudySetPermissions } from "./study-set-access";
import { toDetailDto, type StudySetDetailDto } from "./study-set.presenter";
import { assertWorkspaceMember, assetNotReady, buildPresentContext, isSrEnrolled, loadSet, withClock, type ResolvedStudyDeps, type StudyDeps } from "./study.deps";
import { normalizeTags } from "./study-tags";

/** Tạo / xem / sửa thông tin / xoá mềm bộ học — p4-01 be.md §4–§5. Danh sách + nhân bản + kiểm duyệt ở service riêng. */
export class StudySetService {
  private readonly d: ResolvedStudyDeps;

  constructor(deps: StudyDeps) {
    this.d = withClock(deps);
  }

  async create(user: AuthUser, dto: CreateSetDto): Promise<StudySetDetailDto> {
    let workspaceId: string | null = null;
    if (dto.visibility === "WORKSPACE") {
      if (!dto.workspaceId) throw studyErrors.workspaceRequired();
      await assertWorkspaceMember(this.d, user, dto.workspaceId);
      workspaceId = dto.workspaceId;
    }
    if (dto.visibility === "PUBLIC" && dto.confirmPublic !== true) throw studyErrors.confirmPublic();
    await this.assertUnderSetLimit(user.id);
    if (dto.coverAssetId) await this.assertCover(user.id, dto.coverAssetId);

    const id = newObjectId();
    const created = await this.d.tx.run(async (tx) => {
      const set = await this.d.sets.create(
        {
          id,
          ownerId: user.id,
          workspaceId,
          title: dto.title,
          normalizedTitle: normalizeSearch(dto.title),
          description: dto.description ? dto.description : null,
          tags: normalizeTags(dto.tags),
          coverAssetId: dto.coverAssetId ?? null,
          language: dto.language ?? null,
          visibility: dto.visibility,
          itemCount: 0,
          itemTypesMask: 0,
          copiedFromId: null,
        },
        tx
      );
      if (dto.coverAssetId) {
        await this.d.assets.attach(tx, { assetIds: [dto.coverAssetId], targetType: "STUDY_SET_COVER", targetId: id, actorId: user.id });
      }
      return set;
    });
    return this.present(created, user, await this.d.access.resolve(user, created), false);
  }

  async get(user: AuthUser, id: string): Promise<StudySetDetailDto> {
    const set = await loadSet(this.d, id);
    return this.present(set, user, await this.d.access.assertMeta(user, set));
  }

  /**
   * Chỉ tác giả. `expectedVersion` lệch → `409 RES_003`. → PUBLIC cần `confirmPublic` (`STUDY_008`); → WORKSPACE cần nhóm
   * (`STUDY_003`) và không đổi nhóm của bộ đã gắn nhóm (muốn sang nhóm khác: nhân bản). PUBLIC → hẹp hơn: bản đã nhân bản
   * giữ nguyên (mỗi bản sao có `AssetLink` riêng). Bộ đã ẩn không sửa được (`STUDY_004`).
   */
  async patch(user: AuthUser, id: string, dto: PatchSetDto): Promise<StudySetDetailDto> {
    const set = await loadSet(this.d, id);
    await this.d.access.assertEdit(user, set);
    if (set.version !== dto.expectedVersion) throw new VersionConflictError(set.version);

    const patch: StudySetPatch = {};
    if (dto.title !== undefined) Object.assign(patch, { title: dto.title, normalizedTitle: normalizeSearch(dto.title) });
    if (dto.description !== undefined) patch.description = dto.description ? dto.description : null;
    if (dto.tags !== undefined) patch.tags = normalizeTags(dto.tags);
    if (dto.language !== undefined) patch.language = dto.language;
    await this.applyVisibility(user, set, dto, patch);
    const coverChange = await this.planCover(user, set, dto.coverAssetId);
    if (coverChange) patch.coverAssetId = coverChange.next;

    const updated = await this.d.tx.run(async (tx) => {
      const next = await this.d.sets.updateIf(id, { version: dto.expectedVersion, statusIn: ["ACTIVE"] }, patch, tx);
      if (!next) throw await this.conflictFor(id);
      if (coverChange?.previous) await this.d.assets.detach(tx, { targetType: "STUDY_SET_COVER", targetId: id, assetIds: [coverChange.previous] });
      if (coverChange?.next) {
        await this.d.assets.attach(tx, { assetIds: [coverChange.next], targetType: "STUDY_SET_COVER", targetId: id, actorId: user.id });
      }
      return next;
    });
    return this.present(updated, user, await this.d.access.resolve(user, updated));
  }

  /** Xoá mềm (`status DELETED`); tiến độ ôn của người khác giữ nguyên nhưng không còn truy cập (p4-02). Tác giả xoá được cả bộ đã ẩn. */
  async remove(user: AuthUser, id: string): Promise<void> {
    const set = await loadSet(this.d, id);
    const perms = await this.d.access.assertMeta(user, set);
    if (!perms.delete) throw new ForbiddenError("Chỉ tác giả được xoá bộ học");
    const removed = await this.d.sets.updateIf(id, { statusIn: ["ACTIVE", "HIDDEN"] }, { status: "DELETED", deletedAt: this.d.now() });
    if (!removed) throw studyErrors.notFound();
  }

  /** `srEnrolled` (p4-02) tính theo NGƯỜI XEM; bộ vừa tạo thì chắc chắn `false` nên bỏ qua truy vấn (`knownEnrolled`). */
  private async present(set: StudySet, user: AuthUser, perms: StudySetPermissions, knownEnrolled?: boolean): Promise<StudySetDetailDto> {
    const [ctx, srEnrolled] = await Promise.all([
      buildPresentContext(this.d, [set]),
      knownEnrolled ?? isSrEnrolled(this.d, user.id, set.id),
    ]);
    return toDetailDto(set, ctx, user.id, perms, srEnrolled);
  }

  private async assertUnderSetLimit(ownerId: string): Promise<void> {
    const { setsPerUserMax } = await studyLimitsOf(this.d);
    if ((await this.d.sets.countByOwner(ownerId)) >= setsPerUserMax) throw studyErrors.setLimit(setsPerUserMax);
  }

  private async assertCover(actorId: string, assetId: string): Promise<void> {
    const found = await this.d.assets.get(assetId);
    const info: (StudyAssetInfo & { linked: boolean }) | null = found ? { ...found.asset, linked: found.linked } : null;
    if (!isUsableAsset(info, actorId, "IMAGE")) throw assetNotReady();
  }

  private async applyVisibility(user: AuthUser, set: StudySet, dto: PatchSetDto, patch: StudySetPatch): Promise<void> {
    if (dto.workspaceId && set.workspaceId && dto.workspaceId !== set.workspaceId) throw studyErrors.workspaceRequired("IMMUTABLE");
    if (dto.visibility === undefined || dto.visibility === set.visibility) return;
    if (dto.visibility === "PUBLIC" && dto.confirmPublic !== true) throw studyErrors.confirmPublic();
    if (dto.visibility === "WORKSPACE") {
      const workspaceId = set.workspaceId ?? dto.workspaceId;
      if (!workspaceId) throw studyErrors.workspaceRequired();
      await assertWorkspaceMember(this.d, user, workspaceId);
      patch.workspaceId = workspaceId;
    }
    patch.visibility = dto.visibility;
  }

  /** `undefined` = không đổi ảnh bìa; ngược lại `{ previous, next }` (next `null` = bỏ ảnh). */
  private async planCover(user: AuthUser, set: StudySet, requested: string | null | undefined) {
    if (requested === undefined || requested === set.coverAssetId) return null;
    if (requested !== null) await this.assertCover(user.id, requested);
    return { previous: set.coverAssetId, next: requested };
  }

  /** Điều kiện ghi không khớp: bộ đổi phiên bản (409 RES_003), đã ẩn (STUDY_004) hoặc đã xoá (404). */
  private async conflictFor(id: string): Promise<Error> {
    const current = await this.d.sets.findById(id);
    if (!current || current.status === "DELETED") return studyErrors.notFound();
    if (current.status === "HIDDEN") return studyErrors.hidden();
    return new VersionConflictError(current.version);
  }
}
