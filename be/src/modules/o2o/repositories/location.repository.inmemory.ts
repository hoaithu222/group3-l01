import { newObjectId } from "../../../core/utils/object-id";
import { normalizeSearch } from "../../../core/utils/normalize";
import type { Location, LocationReview, LocationStatus, NearLocation } from "../entities/o2o.interface";
import { haversineM } from "../domain/geo";
import type {
  AdminLocationFilter,
  ILocationRepository,
  ILocationReviewRepository,
  LocationCreateInput,
  LocationPatch,
  NearSearch,
  ReviewInput,
} from "./location.repository.interface";

/** Repo in-memory cho unit test (khoảng cách bằng haversine — Mongo thật dùng `$geoNear`). */
export class InMemoryLocationRepository implements ILocationRepository {
  readonly rows = new Map<string, Location>();

  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }

  async findByIds(ids: string[]) {
    return ids.flatMap((id) => (this.rows.has(id) ? [this.rows.get(id) as Location] : []));
  }

  async near(q: NearSearch): Promise<NearLocation[]> {
    return [...this.rows.values()]
      .filter((l) => l.status === "ACTIVE" && (!q.type || l.type === q.type))
      .filter((l) => (q.amenities ?? []).every((a) => l.amenities.includes(a)))
      .map((l) => ({ ...l, distanceM: Math.round(haversineM(q, { lat: l.geo.coordinates[1], lng: l.geo.coordinates[0] })) }))
      .filter((l) => l.distanceM <= q.radiusM)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, q.limit);
  }

  async create(input: LocationCreateInput): Promise<Location> {
    const now = new Date();
    const loc: Location = {
      id: newObjectId(),
      name: input.name,
      normalizedName: input.normalizedName,
      address: input.address,
      geo: { type: "Point", coordinates: [input.lng, input.lat] },
      type: input.type,
      amenities: input.amenities,
      openHours: input.openHours,
      photoAssetIds: input.photoAssetIds,
      ratingAvg: 0,
      ratingCount: 0,
      noiseAvg: 0,
      status: "ACTIVE",
      hiddenReason: null,
      createdBy: input.createdBy,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(loc.id, loc);
    return loc;
  }

  async update(id: string, expectedVersion: number, patch: LocationPatch) {
    const cur = this.rows.get(id);
    if (!cur || cur.version !== expectedVersion) return null;
    const next: Location = {
      ...cur,
      ...(patch.name !== undefined && { name: patch.name, normalizedName: normalizeSearch(patch.name) }),
      ...(patch.address !== undefined && { address: patch.address }),
      ...(patch.lat !== undefined && patch.lng !== undefined && { geo: { type: "Point" as const, coordinates: [patch.lng, patch.lat] as [number, number] } }),
      ...(patch.type !== undefined && { type: patch.type }),
      ...(patch.amenities !== undefined && { amenities: patch.amenities }),
      ...(patch.openHours !== undefined && { openHours: patch.openHours }),
      ...(patch.photoAssetIds !== undefined && { photoAssetIds: patch.photoAssetIds }),
      version: cur.version + 1,
      updatedAt: new Date(),
    };
    this.rows.set(id, next);
    return next;
  }

  async setStatus(id: string, status: LocationStatus, reason: string | null) {
    const cur = this.rows.get(id);
    if (!cur) return null;
    const next = { ...cur, status, hiddenReason: status === "HIDDEN" ? reason : null, version: cur.version + 1 };
    this.rows.set(id, next);
    return next;
  }

  async setRating(id: string, stats: { ratingAvg: number; ratingCount: number; noiseAvg: number }) {
    const cur = this.rows.get(id);
    if (cur) this.rows.set(id, { ...cur, ...stats });
  }

  async listAdmin(f: AdminLocationFilter) {
    const all = [...this.rows.values()].filter(
      (l) => (!f.type || l.type === f.type) && (!f.status || l.status === f.status) && (!f.q || l.normalizedName.includes(normalizeSearch(f.q)))
    );
    return { data: all.slice((f.page - 1) * f.limit, f.page * f.limit), total: all.length };
  }
}

export class InMemoryLocationReviewRepository implements ILocationReviewRepository {
  readonly rows = new Map<string, LocationReview>();
  private key = (locationId: string, userId: string) => `${locationId}:${userId}`;

  async findMine(locationId: string, userId: string) {
    return this.rows.get(this.key(locationId, userId)) ?? null;
  }

  async upsert(locationId: string, userId: string, input: ReviewInput): Promise<LocationReview> {
    const cur = this.rows.get(this.key(locationId, userId));
    const now = new Date();
    const next: LocationReview = cur
      ? { ...cur, ...input, updatedAt: now }
      : { id: newObjectId(), locationId, userId, ...input, hiddenAt: null, createdAt: now, updatedAt: now };
    this.rows.set(this.key(locationId, userId), next);
    return next;
  }

  async deleteMine(locationId: string, userId: string) {
    return this.rows.delete(this.key(locationId, userId));
  }

  private sorted(locationId: string, visibleOnly: boolean, before?: { at: Date; id: string }) {
    return [...this.rows.values()]
      .filter((r) => r.locationId === locationId && (!visibleOnly || r.hiddenAt === null))
      .filter((r) => !before || r.createdAt < before.at || (r.createdAt.getTime() === before.at.getTime() && r.id < before.id))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
  }

  async listVisible(locationId: string, opts: { before?: { at: Date; id: string }; limit: number }) {
    return this.sorted(locationId, true, opts.before).slice(0, opts.limit);
  }

  async listAll(locationId: string, opts: { before?: { at: Date; id: string }; limit: number }) {
    return this.sorted(locationId, false, opts.before).slice(0, opts.limit);
  }

  async findById(id: string) {
    return [...this.rows.values()].find((r) => r.id === id) ?? null;
  }

  async setHidden(id: string, hidden: boolean) {
    const cur = await this.findById(id);
    if (!cur) return null;
    const next = { ...cur, hiddenAt: hidden ? new Date() : null };
    this.rows.set(this.key(cur.locationId, cur.userId), next);
    return next;
  }

  async stats(locationId: string) {
    const visible = [...this.rows.values()].filter((r) => r.locationId === locationId && r.hiddenAt === null);
    const avg = (xs: number[]) => (xs.length === 0 ? 0 : Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10);
    return { ratingAvg: avg(visible.map((r) => r.rating)), ratingCount: visible.length, noiseAvg: avg(visible.map((r) => r.noise)) };
  }
}
