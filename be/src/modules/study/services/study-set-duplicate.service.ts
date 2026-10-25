import { LIMITS } from "../../../core/constants/limits";
import { newObjectId } from "../../../core/utils/object-id";
import { graphemeLength, normalizeSearch } from "../../../core/utils/normalize";
import type { AuthUser } from "../../../core/types/express";
import type { DuplicateSetDto } from "../dtos";
import { mediaAssetIdsOf, typesMask, type StudyItemCreateInput } from "../entities/study-item.interface";
import { studyErrors } from "../study.errors";
import { studyLimitsOf } from "./study-limits";
import { toDetailDto, type StudySetDetailDto } from "./study-set.presenter";
import { assertWorkspaceMember, buildPresentContext, loadSet, withClock, type ResolvedStudyDeps, type StudyDeps } from "./study.deps";

const COPY_SUFFIX = " (bản sao)";

/** Cắt phần đầu tiêu đề để `tiêu đề + " (bản sao)"` vẫn ≤ `setTitleMax` grapheme. */
function copyTitle(title: string): string {
  const room = LIMITS.study.setTitleMax - COPY_SUFFIX.length;
  const chars = Array.from(new Intl.Segmenter("vi", { granularity: "grapheme" }).segment(title), (s) => s.segment);
  const base = graphemeLength(title) > room ? chars.slice(0, room).join("").trimEnd() : title;
  return `${base}${COPY_SUFFIX}`;
}

/**
 * `POST /study-sets/:id/duplicate` — nhân bản bộ VỀ TÀI KHOẢN NGƯỜI GỌI (be.md §5). Bản sao là `StudySet` + `StudyItem` MỚI
 * (id mới, giữ id lựa chọn/thứ tự) với `AssetLink` MỚI trỏ CÙNG asset (không copy tệp) — nên tác giả gốc đổi bộ sang
 * PRIVATE/xoá thì bản sao vẫn xem được ảnh (ST-18). `copyCount` của bản gốc tăng NGOÀI transaction (`$inc`).
 */
export class StudySetDuplicateService {
  private readonly d: ResolvedStudyDeps;

  constructor(deps: StudyDeps) {
    this.d = withClock(deps);
  }

  async duplicate(user: AuthUser, sourceId: string, dto: DuplicateSetDto): Promise<StudySetDetailDto> {
    const source = await loadSet(this.d, sourceId);
    const perms = await this.d.access.assertMeta(user, source);
    if (source.status === "HIDDEN") throw studyErrors.hidden();
    if (!perms.duplicate) throw studyErrors.notFound();

    let workspaceId: string | null = null;
    if (dto.targetVisibility === "WORKSPACE") {
      if (!dto.workspaceId) throw studyErrors.workspaceRequired();
      await assertWorkspaceMember(this.d, user, dto.workspaceId);
      workspaceId = dto.workspaceId;
    }
    const { setsPerUserMax } = await studyLimitsOf(this.d);
    if ((await this.d.sets.countByOwner(user.id)) >= setsPerUserMax) throw studyErrors.setLimit(setsPerUserMax);

    const sourceItems = await this.d.items.listBySet(source.id);
    const id = newObjectId();
    const copies: StudyItemCreateInput[] = sourceItems.map((i) => ({
      id: newObjectId(),
      setId: id,
      ownerId: user.id,
      order: i.order,
      type: i.type,
      prompt: i.prompt,
      answerText: i.answerText,
      options: i.options.map((o) => ({ ...o })),
      correctOptionIds: [...i.correctOptionIds],
      acceptedAnswers: [...i.acceptedAnswers],
      matchMode: i.matchMode,
      explanation: i.explanation,
      frontMediaAssetId: i.frontMediaAssetId,
      backMediaAssetId: i.backMediaAssetId,
      audioAssetId: i.audioAssetId,
      tags: [...i.tags],
    }));

    const title = copyTitle(source.title);
    const created = await this.d.tx.run(async (tx) => {
      const set = await this.d.sets.create(
        {
          id,
          ownerId: user.id,
          workspaceId,
          title,
          normalizedTitle: normalizeSearch(title),
          description: source.description,
          tags: [...source.tags],
          coverAssetId: source.coverAssetId,
          language: source.language,
          visibility: dto.targetVisibility,
          itemCount: copies.length,
          itemTypesMask: typesMask(copies.map((c) => c.type)),
          copiedFromId: source.id,
        },
        tx
      );
      await this.d.items.createMany(copies, tx);
      if (source.coverAssetId) {
        await this.d.assets.attach(tx, { assetIds: [source.coverAssetId], targetType: "STUDY_SET_COVER", targetId: id, actorId: user.id, foreignReadable: true });
      }
      for (const copy of copies) {
        const assetIds = mediaAssetIdsOf(copy);
        if (assetIds.length > 0) await this.d.assets.attach(tx, { assetIds, targetType: "STUDY_ITEM", targetId: copy.id, actorId: user.id, foreignReadable: true });
      }
      return set;
    });

    await this.d.sets.incCopyCount(source.id).catch(() => undefined); // số liệu phụ — lỗi không làm hỏng việc nhân bản
    const ctx = await buildPresentContext(this.d, [created]);
    return toDetailDto(created, ctx, user.id, await this.d.access.resolve(user, created));
  }
}
