import type { AuthUser } from "../../../core/types/express";
import { LIMITS } from "../../../core/constants/limits";
import { beforeOf, cursorPage } from "./cursor-page";
import type { Location } from "../entities/o2o.interface";
import { isOpenAt } from "../domain/open-hours";
import type { NearQueryDto, ReviewDto } from "../dtos";
import { o2oErrors } from "../o2o.errors";
import type { O2oDeps } from "./o2o.deps";
import { locationBase, reviewView, shopPublicView } from "./o2o.presenter";

const TZ = LIMITS.o2o.timezone;
const RECENT_REVIEWS = 5;

/**
 * Địa điểm phía người dùng (be.md §4): gần tôi, chi tiết, đánh giá. Toạ độ người dùng chỉ đi qua truy vấn — không lưu/log.
 * Địa điểm HIDDEN (hoặc không tồn tại) → `O2O_010` 404 trung tính.
 */
export class LocationsService {
  constructor(private readonly deps: O2oDeps) {}

  async near(q: NearQueryDto) {
    const hits = await this.deps.locations.near({ lat: q.lat, lng: q.lng, radiusM: q.radiusM, type: q.type, amenities: q.amenities, limit: q.limit });
    const shops = await this.deps.shops.findByLocationIds(hits.filter((l) => l.type === "PRINT_SHOP").map((l) => l.id));
    const shopByLocation = new Map(shops.filter((s) => s.status === "APPROVED").map((s) => [s.locationId, s]));
    const now = this.deps.now();
    const items = hits.map((l) => {
      const shop = shopByLocation.get(l.id);
      return {
        ...locationBase(l),
        distanceM: l.distanceM,
        openNow: isOpenAt(l.openHours, now, TZ),
        shop: shop ? { id: shop.id, displayName: shop.displayName, acceptingOrders: shop.acceptingOrders } : null,
      };
    });
    return q.openNow ? items.filter((i) => i.openNow === true) : items;
  }

  async detail(user: AuthUser, id: string) {
    const loc = await this.visible(id);
    const [shop, photos, recent, mine] = await Promise.all([
      this.deps.shops.findByLocationId(loc.id),
      this.deps.assets.signPhotos(loc.photoAssetIds, user),
      this.deps.reviews.listVisible(loc.id, { limit: RECENT_REVIEWS }),
      this.deps.reviews.findMine(loc.id, user.id),
    ]);
    const names = await this.deps.directory.usersByIds([...recent.map((r) => r.userId), ...(mine ? [mine.userId] : [])]);
    const nameOf = (userId: string) => names.get(userId)?.name ?? null;
    return {
      ...locationBase(loc),
      openHours: loc.openHours,
      openNow: isOpenAt(loc.openHours, this.deps.now(), TZ),
      photos,
      recentReviews: recent.map((r) => reviewView(r, nameOf(r.userId), user.id)),
      myReview: mine ? reviewView(mine, nameOf(mine.userId), user.id) : null,
      shop: shop && shop.status === "APPROVED" ? shopPublicView(shop) : null,
    };
  }

  async listReviews(user: AuthUser, id: string, query: { cursor?: string; limit: number }) {
    const loc = await this.visible(id);
    const rows = await this.deps.reviews.listVisible(loc.id, { before: beforeOf(query.cursor), limit: query.limit + 1 });
    const { page, meta } = cursorPage(rows, query.limit);
    const names = await this.deps.directory.usersByIds(page.map((r) => r.userId));
    return { data: page.map((r) => reviewView(r, names.get(r.userId)?.name ?? null, user.id)), meta };
  }

  async upsertReview(user: AuthUser, id: string, dto: ReviewDto) {
    const loc = await this.visible(id);
    const review = await this.deps.tx.run(async (tx) => {
      const saved = await this.deps.reviews.upsert(loc.id, user.id, { rating: dto.rating, noise: dto.noise, comment: dto.comment || null }, tx);
      await this.deps.locations.setRating(loc.id, await this.deps.reviews.stats(loc.id, tx), tx);
      return saved;
    });
    const stats = await this.deps.reviews.stats(loc.id);
    return { review: reviewView(review, user.name ?? null, user.id), location: { id: loc.id, ...stats } };
  }

  async deleteReview(user: AuthUser, id: string) {
    const loc = await this.visible(id);
    const removed = await this.deps.tx.run(async (tx) => {
      const ok = await this.deps.reviews.deleteMine(loc.id, user.id, tx);
      if (ok) await this.deps.locations.setRating(loc.id, await this.deps.reviews.stats(loc.id, tx), tx);
      return ok;
    });
    if (!removed) throw o2oErrors.notFound();
    return { location: { id: loc.id, ...(await this.deps.reviews.stats(loc.id)) } };
  }

  private async visible(id: string): Promise<Location> {
    const loc = await this.deps.locations.findById(id);
    if (!loc || loc.status !== "ACTIVE") throw o2oErrors.locationHidden();
    return loc;
  }
}
