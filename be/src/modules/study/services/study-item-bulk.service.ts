import { VersionConflictError } from "../../../core/exceptions";
import { LIMITS } from "../../../core/constants/limits";
import { newObjectId } from "../../../core/utils/object-id";
import type { AuthUser } from "../../../core/types/express";
import { DOMAIN_EVENTS, eventKeys, type SrItemDeletedPayload } from "../../../shared/events/domain-events";
import type { PutItemsDto } from "../dtos";
import { mediaAssetIdsOf, typesMask, type StudyItem } from "../entities/study-item.interface";
import { studyErrors } from "../study.errors";
import { computeOrders, type OrderOp } from "./study-item-order";
import { collectMediaAssetIds, validateItems, type AssetCheck, type ValidatedItem } from "./study-item.validator";
import { studyLimitsOf } from "./study-limits";
import { loadSet, withClock, type ResolvedStudyDeps, type StudyDeps } from "./study.deps";

export interface PutItemsResult {
  /** `version` MỚI của bộ — client dùng làm `expectedVersion` cho lần lưu kế tiếp. */
  version: number;
  itemCount: number;
  /** Mọi mục trong `upsert[]` (mới lẫn cũ): `clientItemKey` → `id`. */
  idMap: Array<{ clientItemKey: string; id: string }>;
}

/**
 * `PUT /study-sets/:id/items` — lưu hàng loạt `{ upsert[], delete[] }` trong MỘT transaction (be.md §5). Thứ tự: kiểm quyền
 * + phiên bản → tra asset một lượt → validate TẤT CẢ mục (gom lỗi có index, `STUDY_001`) → kiểm số mục (`STUDY_002`) → tính
 * `order` tương đối → transaction: CAS `version` TRƯỚC (hai phiên soạn cùng `expectedVersion` — một thắng, một `RES_003`;
 * ST-25) rồi xoá/sửa/thêm mục + gắn/gỡ `AssetLink`. Lỗi ở bất kỳ bước nào → rollback toàn bộ (ST-03).
 */
export class StudyItemBulkService {
  private readonly d: ResolvedStudyDeps;

  constructor(deps: StudyDeps) {
    this.d = withClock(deps);
  }

  async save(user: AuthUser, setId: string, dto: PutItemsDto): Promise<PutItemsResult> {
    const set = await loadSet(this.d, setId);
    await this.d.access.assertEdit(user, set);
    if (set.version !== dto.expectedVersion) throw new VersionConflictError(set.version);
    if (dto.upsert.length === 0 && dto.delete.length === 0) return { version: set.version, itemCount: set.itemCount, idMap: [] };

    const existing = await this.d.items.listBySet(setId);
    const existingById = new Map(existing.map((i) => [i.id, i]));
    const deleteIds = new Set(dto.delete);
    const existingMedia = new Set(existing.flatMap((i) => mediaAssetIdsOf(i)));

    const { items: valid, errors } = validateItems(dto.upsert, {
      actorId: user.id,
      existingById,
      deleteIds,
      existingMedia,
      assets: await this.lookupAssets(dto.upsert, existingMedia),
    });
    // Trần HẠ bởi admin (`limits.study`, thấp hơn trần cứng của DTO Zod): số lựa chọn/câu kiểm ở đây, gom cùng lỗi có index của validator.
    const limits = await studyLimitsOf(this.d);
    for (const v of valid) {
      if (v.content.options.length > limits.optionsMax) errors.push({ index: v.index, clientItemKey: v.clientItemKey, field: "options", code: "TOO_MANY" });
    }
    if (errors.length > 0) throw studyErrors.invalidItems(errors.sort((a, b) => a.index - b.index).slice(0, LIMITS.study.errorDetailsMax));

    const removed = existing.filter((i) => deleteIds.has(i.id));
    const created = valid.filter((v) => v.existing === null);
    const finalCount = existing.length - removed.length + created.length;
    if (finalCount > limits.itemsPerSetMax) throw studyErrors.itemLimit(limits.itemsPerSetMax);

    const newIds = new Map(created.map((v) => [v.clientItemKey, newObjectId()]));
    const idOf = (v: ValidatedItem): string => v.existing?.id ?? (newIds.get(v.clientItemKey) as string);
    const { orders, renumbered } = this.planOrders(existing, deleteIds, valid, existingById);

    const finalTypes = [
      ...existing.filter((i) => !deleteIds.has(i.id) && !valid.some((v) => v.existing?.id === i.id)).map((i) => i.type),
      ...valid.map((v) => v.content.type),
    ];

    const version = await this.d.tx.run(async (tx) => {
      const updated = await this.d.sets.updateIf(
        setId,
        { version: dto.expectedVersion, statusIn: ["ACTIVE"] },
        { itemCount: finalCount, itemTypesMask: typesMask(finalTypes) },
        tx
      );
      if (!updated) throw await this.conflictFor(setId);

      if (removed.length > 0) {
        await this.d.items.deleteMany(setId, removed.map((i) => i.id), tx);
        for (const item of removed) {
          if (mediaAssetIdsOf(item).length > 0) await this.d.assets.detach(tx, { targetType: "STUDY_ITEM", targetId: item.id });
        }
        // p4-02: dọn `SrProgress` của mục đã xoá (job `sr.item-deleted`, queue `cron`). `dedupeKey` gắn `version` MỚI của bộ nên mỗi lần lưu một dòng.
        const payload: SrItemDeletedPayload = {
          event: DOMAIN_EVENTS.SR_ITEM_DELETED,
          setId,
          itemIds: removed.map((i) => i.id),
          setVersion: updated.version,
        };
        await this.d.outbox.add(tx, {
          type: DOMAIN_EVENTS.SR_ITEM_DELETED,
          aggregateType: "StudySet",
          aggregateId: setId,
          queue: "cron",
          jobName: "sr.item-deleted",
          dedupeKey: eventKeys.srItemDeleted(setId, updated.version),
          payload: payload as unknown as Record<string, unknown>,
        });
      }

      const updatedIds = new Set<string>();
      for (const v of valid) {
        if (!v.existing) continue;
        updatedIds.add(v.existing.id);
        await this.d.items.update(setId, v.existing.id, { ...v.content, order: orders.get(v.existing.id) }, tx);
        const before = mediaAssetIdsOf(v.existing);
        const after = mediaAssetIdsOf(v.content);
        const dropped = before.filter((a) => !after.includes(a));
        const added = after.filter((a) => !before.includes(a));
        if (dropped.length > 0) await this.d.assets.detach(tx, { targetType: "STUDY_ITEM", targetId: v.existing.id, assetIds: dropped });
        if (added.length > 0) await this.d.assets.attach(tx, { assetIds: added, targetType: "STUDY_ITEM", targetId: v.existing.id, actorId: user.id });
      }
      // Nén thứ tự: các mục KHÁC (không nằm trong lượt) cũng đổi `order`.
      if (renumbered) {
        for (const [ref, order] of orders) if (existingById.has(ref) && !updatedIds.has(ref)) await this.d.items.setOrder(setId, ref, order, tx);
      }

      await this.d.items.createMany(
        created.map((v) => ({ ...v.content, id: idOf(v), setId, ownerId: user.id, order: orders.get(`new:${v.clientItemKey}`) as number })),
        tx
      );
      for (const v of created) {
        const assetIds = mediaAssetIdsOf(v.content);
        if (assetIds.length > 0) await this.d.assets.attach(tx, { assetIds, targetType: "STUDY_ITEM", targetId: idOf(v), actorId: user.id });
      }
      return updated.version;
    });

    return { version, itemCount: finalCount, idMap: valid.map((v) => ({ clientItemKey: v.clientItemKey, id: idOf(v) })) };
  }

  /** Tra một lượt các asset MỚI (không nằm trong media hiện có của bộ) mà các mục tham chiếu. */
  private async lookupAssets(raw: readonly unknown[], existingMedia: ReadonlySet<string>): Promise<Map<string, AssetCheck | null>> {
    const wanted = collectMediaAssetIds(raw).filter((id) => !existingMedia.has(id));
    const found = await Promise.all(wanted.map(async (id) => [id, await this.d.assets.get(id)] as const));
    return new Map(found.map(([id, f]) => [id, f ? { ...f.asset, linked: f.linked } : null]));
  }

  private planOrders(existing: readonly StudyItem[], deleteIds: ReadonlySet<string>, valid: readonly ValidatedItem[], existingById: ReadonlyMap<string, StudyItem>) {
    const refOf = (v: ValidatedItem): string => v.existing?.id ?? `new:${v.clientItemKey}`;
    const keyToRef = new Map(valid.map((v) => [v.clientItemKey, refOf(v)]));
    const ops: OrderOp[] = valid.map((v) => {
      let after: string | null | undefined;
      if (v.after === null) after = null;
      else if (v.after !== undefined) after = keyToRef.get(v.after) ?? (existingById.has(v.after) ? v.after : undefined);
      return { ref: refOf(v), existing: v.existing !== null, after };
    });
    const current = existing.filter((i) => !deleteIds.has(i.id)).map((i) => ({ ref: i.id, order: i.order }));
    return computeOrders(current, ops);
  }

  /** CAS thất bại: bộ đổi phiên bản (409 RES_003), đã ẩn (STUDY_004) hoặc đã xoá (404). */
  private async conflictFor(setId: string): Promise<Error> {
    const current = await this.d.sets.findById(setId);
    if (!current || current.status === "DELETED") return studyErrors.notFound();
    if (current.status === "HIDDEN") return studyErrors.hidden();
    return new VersionConflictError(current.version);
  }
}
