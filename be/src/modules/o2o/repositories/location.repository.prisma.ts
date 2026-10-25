import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { ensureManualIndexesBestEffort, isMissingGeoIndexError } from "../../../infrastructure/database/ensure-manual-indexes";
import { escapeRegex } from "../../../core/utils/escape-regex";
import { normalizeSearch } from "../../../core/utils/normalize";
import type { Location, LocationStatus, NearLocation } from "../entities/o2o.interface";
import type {
  AdminLocationFilter,
  ILocationRepository,
  LocationCreateInput,
  LocationPatch,
  NearSearch,
} from "./location.repository.interface";
import { rawId, rawNumber, toLocation } from "./o2o.mappers";
import type { TxHandle } from "./tx";

const db = (tx?: TxHandle) => tx ?? prisma;
const point = (lat: number, lng: number) => ({ type: "Point", coordinates: [lng, lat] });

/**
 * Địa điểm — truy vấn gần bằng `aggregateRaw([$geoNear])` (cần index `2dsphere` trên `geo`, tạo bởi `scripts/ensure-indexes.ts`).
 * Raw chỉ lấy `_id` + `distanceM`, đọc lại chi tiết bằng `findMany` có kiểu (mẫu `discovery` p1-09) rồi giữ thứ tự khoảng cách.
 */
export class PrismaLocationRepository implements ILocationRepository {
  async findById(id: string): Promise<Location | null> {
    const r = await prisma.location.findUnique({ where: { id } });
    return r ? toLocation(r) : null;
  }

  async findByIds(ids: string[]): Promise<Location[]> {
    if (ids.length === 0) return [];
    return (await prisma.location.findMany({ where: { id: { in: ids } } })).map(toLocation);
  }

  async near(q: NearSearch): Promise<NearLocation[]> {
    const query: Record<string, unknown> = { status: "ACTIVE" };
    if (q.type) query.type = q.type;
    if (q.amenities && q.amenities.length > 0) query.amenities = { $all: q.amenities };
    const runNear = async () =>
      (await prisma.location.aggregateRaw({
        pipeline: [
          {
            $geoNear: {
              near: point(q.lat, q.lng),
              key: "geo",
              distanceField: "distanceM",
              maxDistance: q.radiusM,
              query,
              spherical: true,
            },
          },
          { $limit: q.limit },
          { $project: { _id: 1, distanceM: 1 } },
        ] as Prisma.InputJsonValue[],
      })) as unknown as Array<Record<string, unknown>>;
    let raw: Array<Record<string, unknown>>;
    try {
      raw = await runNear();
    } catch (err) {
      // `prisma db push` xoá index 2dsphere (Prisma không quản) — tự tạo lại rồi thử MỘT lần thay vì trả 500 cho tới khi ai đó chạy tay.
      if (!isMissingGeoIndexError(err) || !(await ensureManualIndexesBestEffort())) throw err;
      raw = await runNear();
    }
    const hits = raw
      .map((d) => ({ id: rawId(d._id), distanceM: rawNumber(d.distanceM) }))
      .filter((h): h is { id: string; distanceM: number } => h.id !== null && Number.isFinite(h.distanceM));
    const byId = new Map((await this.findByIds(hits.map((h) => h.id))).map((l) => [l.id, l]));
    return hits.flatMap((h) => {
      const loc = byId.get(h.id);
      return loc && loc.status === "ACTIVE" ? [{ ...loc, distanceM: Math.round(h.distanceM) }] : [];
    });
  }

  async create(input: LocationCreateInput, tx?: TxHandle): Promise<Location> {
    const r = await db(tx).location.create({
      data: {
        name: input.name,
        normalizedName: input.normalizedName,
        address: input.address,
        geo: point(input.lat, input.lng),
        type: input.type,
        amenities: input.amenities,
        openHours: input.openHours,
        photoAssetIds: input.photoAssetIds,
        status: "ACTIVE",
        hiddenReason: null,
        createdBy: input.createdBy,
      },
    });
    return toLocation(r);
  }

  async update(id: string, expectedVersion: number, patch: LocationPatch, tx?: TxHandle): Promise<Location | null> {
    const data: Prisma.LocationUpdateManyMutationInput = {
      ...(patch.name !== undefined && { name: patch.name, normalizedName: patch.normalizedName ?? normalizeSearch(patch.name) }),
      ...(patch.address !== undefined && { address: patch.address }),
      ...(patch.lat !== undefined && patch.lng !== undefined && { geo: point(patch.lat, patch.lng) }),
      ...(patch.type !== undefined && { type: patch.type }),
      ...(patch.amenities !== undefined && { amenities: patch.amenities }),
      ...(patch.openHours !== undefined && { openHours: patch.openHours }),
      ...(patch.photoAssetIds !== undefined && { photoAssetIds: patch.photoAssetIds }),
      version: { increment: 1 },
    };
    const res = await db(tx).location.updateMany({ where: { id, version: expectedVersion }, data });
    if (res.count === 0) return null;
    const r = await db(tx).location.findUnique({ where: { id } });
    return r ? toLocation(r) : null;
  }

  async setStatus(id: string, status: LocationStatus, reason: string | null): Promise<Location | null> {
    const res = await prisma.location.updateMany({
      where: { id },
      data: { status, hiddenReason: status === "HIDDEN" ? reason : null, version: { increment: 1 } },
    });
    return res.count === 0 ? null : this.findById(id);
  }

  async setRating(id: string, stats: { ratingAvg: number; ratingCount: number; noiseAvg: number }, tx?: TxHandle): Promise<void> {
    await db(tx).location.update({ where: { id }, data: stats });
  }

  async listAdmin(f: AdminLocationFilter): Promise<{ data: Location[]; total: number }> {
    const where: Prisma.LocationWhereInput = {
      ...(f.type && { type: f.type }),
      ...(f.status && { status: f.status }),
      ...(f.amenity && { amenities: { has: f.amenity } }),
      ...(f.q && { normalizedName: { contains: escapeRegex(normalizeSearch(f.q)) } }),
    };
    const [rows, total] = await Promise.all([
      prisma.location.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (f.page - 1) * f.limit, take: f.limit }),
      prisma.location.count({ where }),
    ]);
    return { data: rows.map(toLocation), total };
  }
}
