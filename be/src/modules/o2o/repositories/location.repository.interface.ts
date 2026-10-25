import type { Location, LocationReview, LocationStatus, LocationType, NearLocation, OpenHour } from "../entities/o2o.interface";
import type { TxHandle } from "./tx";

export interface NearSearch {
  lat: number;
  lng: number;
  radiusM: number;
  type?: LocationType;
  amenities?: string[];
  limit: number;
}

export interface LocationCreateInput {
  name: string;
  normalizedName: string;
  address: string;
  lat: number;
  lng: number;
  type: LocationType;
  amenities: string[];
  openHours: OpenHour[];
  photoAssetIds: string[];
  createdBy: string;
}

export type LocationPatch = Partial<Omit<LocationCreateInput, "createdBy">>;

export interface AdminLocationFilter {
  page: number;
  limit: number;
  q?: string;
  type?: LocationType;
  status?: LocationStatus;
  amenity?: string;
}

export interface ILocationRepository {
  findById(id: string): Promise<Location | null>;
  findByIds(ids: string[]): Promise<Location[]>;
  /** ACTIVE trong bán kính, sắp theo khoảng cách tăng dần (Mongo `$geoNear` + index `2dsphere`). */
  near(q: NearSearch): Promise<NearLocation[]>;
  create(input: LocationCreateInput, tx?: TxHandle): Promise<Location>;
  /** CAS theo `expectedVersion` — `null` khi lệch version/không tồn tại. */
  update(id: string, expectedVersion: number, patch: LocationPatch, tx?: TxHandle): Promise<Location | null>;
  setStatus(id: string, status: LocationStatus, reason: string | null): Promise<Location | null>;
  setRating(id: string, stats: { ratingAvg: number; ratingCount: number; noiseAvg: number }, tx?: TxHandle): Promise<void>;
  listAdmin(filter: AdminLocationFilter): Promise<{ data: Location[]; total: number }>;
}

export interface ReviewInput {
  rating: number;
  noise: number;
  comment: string | null;
}

export interface ILocationReviewRepository {
  findMine(locationId: string, userId: string): Promise<LocationReview | null>;
  upsert(locationId: string, userId: string, input: ReviewInput, tx?: TxHandle): Promise<LocationReview>;
  deleteMine(locationId: string, userId: string, tx?: TxHandle): Promise<boolean>;
  /** Đánh giá chưa ẩn, mới nhất trước — cursor `(createdAt, id)`. */
  listVisible(locationId: string, opts: { before?: { at: Date; id: string }; limit: number }): Promise<LocationReview[]>;
  /** Mọi đánh giá (kể cả đã ẩn) cho vận hành. */
  listAll(locationId: string, opts: { before?: { at: Date; id: string }; limit: number }): Promise<LocationReview[]>;
  findById(id: string): Promise<LocationReview | null>;
  setHidden(id: string, hidden: boolean, tx?: TxHandle): Promise<LocationReview | null>;
  /** Trung bình + số lượng trên đánh giá CHƯA ẩn (đọc trong CÙNG transaction với lúc ghi). */
  stats(locationId: string, tx?: TxHandle): Promise<{ ratingAvg: number; ratingCount: number; noiseAvg: number }>;
}
