import type { AuthUser } from "../../../core/types/express";
import { normalizeSearch } from "../../../core/utils/normalize";
import { beforeOf, cursorPage } from "./cursor-page";
import type { Location } from "../entities/o2o.interface";
import type { AdminLocationDto, AdminLocationUpdateDto, AdminLocationsQueryDto } from "../dtos";
import { o2oErrors } from "../o2o.errors";
import type { O2oDeps } from "./o2o.deps";
import { locationBase, reviewView } from "./o2o.presenter";
import type { TxHandle } from "../repositories/tx";

/**
 * Vận hành địa điểm (`/admin/locations*`, quyền `o2o:*`): CRUD + ẩn/hiện (lý do, audit) + ảnh qua `AssetLink LOCATION_PHOTO`
 * (scope USER — người dùng đăng nhập xem được) + ẩn đánh giá vi phạm. Đổi ảnh = gỡ link ảnh bỏ, gắn link ảnh mới trong CÙNG tx.
 */
export class AdminLocationsService {
  constructor(private readonly deps: O2oDeps) {}

  async list(q: AdminLocationsQueryDto) {
    const { data, total } = await this.deps.locations.listAdmin(q);
    const shops = new Map((await this.deps.shops.findByLocationIds(data.map((l) => l.id))).map((s) => [s.locationId, s]));
    return {
      data: data.map((l) => {
        const s = shops.get(l.id);
        return { ...this.view(l), shop: s ? { id: s.id, displayName: s.displayName, status: s.status } : null };
      }),
      total,
    };
  }

  async get(actor: AuthUser, id: string) {
    const loc = await this.must(id);
    const [shop, photos] = await Promise.all([this.deps.shops.findByLocationId(id), this.deps.assets.signPhotos(loc.photoAssetIds, actor)]);
    return { ...this.view(loc), photos, shop: shop ? { id: shop.id, displayName: shop.displayName, status: shop.status } : null };
  }

  async create(actor: AuthUser, dto: AdminLocationDto) {
    const loc = await this.deps.tx.run(async (tx) => {
      const created = await this.deps.locations.create({ ...dto, normalizedName: normalizeSearch(dto.name), createdBy: actor.id }, tx);
      await this.linkPhotos(tx, created.id, dto.photoAssetIds, [], actor.id);
      return created;
    });
    await this.audit(actor, "o2o.location-create", loc.id, undefined, { name: loc.name, type: loc.type });
    return this.view(loc);
  }

  async update(actor: AuthUser, id: string, dto: AdminLocationUpdateDto) {
    const cur = await this.must(id);
    const { expectedVersion, ...patch } = dto;
    const loc = await this.deps.tx.run(async (tx) => {
      const updated = await this.deps.locations.update(id, expectedVersion, { ...patch, ...(patch.name && { normalizedName: normalizeSearch(patch.name) }) }, tx);
      if (!updated) throw o2oErrors.versionConflict(cur.version);
      if (patch.photoAssetIds) await this.linkPhotos(tx, id, patch.photoAssetIds, cur.photoAssetIds, actor.id);
      return updated;
    });
    await this.audit(actor, "o2o.location-update", id, undefined, { fields: Object.keys(patch) });
    return this.view(loc);
  }

  async setHidden(actor: AuthUser, id: string, hidden: boolean, reason: string) {
    await this.must(id);
    const loc = await this.deps.locations.setStatus(id, hidden ? "HIDDEN" : "ACTIVE", hidden ? reason : null);
    if (!loc) throw o2oErrors.notFound();
    await this.audit(actor, hidden ? "o2o.location-hide" : "o2o.location-unhide", id, reason);
    return this.view(loc);
  }

  async listReviews(id: string, q: { cursor?: string; limit: number }) {
    await this.must(id);
    const rows = await this.deps.reviews.listAll(id, { before: beforeOf(q.cursor), limit: q.limit + 1 });
    const { page, meta } = cursorPage(rows, q.limit);
    const names = await this.deps.directory.usersByIds(page.map((r) => r.userId));
    return { data: page.map((r) => ({ ...reviewView(r, names.get(r.userId)?.name ?? null, ""), hiddenAt: r.hiddenAt })), meta };
  }

  /** Ẩn/hiện đánh giá vi phạm — điểm trung bình tính lại trong cùng transaction. */
  async setReviewHidden(actor: AuthUser, reviewId: string, hidden: boolean, reason: string) {
    const review = await this.deps.reviews.findById(reviewId);
    if (!review) throw o2oErrors.notFound();
    const updated = await this.deps.tx.run(async (tx) => {
      const r = await this.deps.reviews.setHidden(reviewId, hidden, tx);
      await this.deps.locations.setRating(review.locationId, await this.deps.reviews.stats(review.locationId, tx), tx);
      return r;
    });
    await this.audit(actor, hidden ? "o2o.review-hide" : "o2o.review-unhide", reviewId, reason, { locationId: review.locationId });
    return { id: reviewId, hiddenAt: updated?.hiddenAt ?? null };
  }

  private view(l: Location) {
    return { ...locationBase(l), openHours: l.openHours, photoAssetIds: l.photoAssetIds, status: l.status, hiddenReason: l.hiddenReason, version: l.version, createdAt: l.createdAt, updatedAt: l.updatedAt };
  }

  private async must(id: string): Promise<Location> {
    const loc = await this.deps.locations.findById(id);
    if (!loc) throw o2oErrors.notFound();
    return loc;
  }

  private async linkPhotos(tx: TxHandle, locationId: string, next: string[], prev: string[], actorId: string): Promise<void> {
    const removed = prev.filter((id) => !next.includes(id));
    const added = next.filter((id) => !prev.includes(id));
    if (removed.length > 0) await this.deps.assets.detach(tx, { targetType: "LOCATION_PHOTO", targetId: locationId, assetIds: removed });
    if (added.length > 0) {
      const assets = await Promise.all(added.map((id) => this.deps.assets.get(id)));
      if (assets.some((a) => !a || a.kind !== "IMAGE")) throw o2oErrors.invalidFile("NOT_IMAGE");
      await this.deps.assets.attach(tx, { assetIds: added, targetType: "LOCATION_PHOTO", targetId: locationId, scopeType: "USER", actorId });
    }
  }

  private async audit(actor: AuthUser, action: string, targetId: string, reason?: string, metadata?: Record<string, unknown>) {
    await this.deps.audit.record({ actorId: actor.id, actorRole: actor.role, action, targetType: action.startsWith("o2o.review") ? "LocationReview" : "Location", targetId, reason, metadata });
  }
}
