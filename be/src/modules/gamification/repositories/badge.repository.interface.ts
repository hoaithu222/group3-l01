import type { Badge, BadgeCreateInput, BadgePatch } from "../entities/gamification.interface";
import type { TxHandle } from "./tx";

export interface BadgeListParams {
  page: number;
  limit: number;
  isActive?: boolean;
  /** Từ khoá theo tên (khớp không dấu, không phân biệt hoa/thường); rỗng/thiếu = không lọc. */
  q?: string;
}

export interface IBadgeRepository {
  /** Mọi huy hiệu đang bật (danh mục) theo `order`. */
  listActive(): Promise<Badge[]>;
  /** Huy hiệu ĐANG BẬT có counter giao với `keys` — chỉ đánh giá những huy hiệu này khi counter đổi. */
  listActiveByCounters(keys: readonly string[]): Promise<Badge[]>;
  findById(id: string): Promise<Badge | null>;
  findByCode(code: string): Promise<Badge | null>;
  findByIds(ids: readonly string[]): Promise<Badge[]>;
  /** `code` trùng → ném `UniqueViolationError`. `tx` khi cần ghi cùng transaction với `AssetLink` ảnh huy hiệu. */
  create(input: BadgeCreateInput, tx?: TxHandle): Promise<Badge>;
  /** CAS `version` (+1) — `null` = lệch phiên bản. `tx` như `create`. */
  updateIf(id: string, expectedVersion: number, patch: BadgePatch, tx?: TxHandle): Promise<Badge | null>;
  /** Phân trang theo `order`, `code`; có `q` → lọc theo tên (không dấu) TRƯỚC khi phân trang nên `total` là số khớp thật. */
  listPage(params: BadgeListParams): Promise<{ rows: Badge[]; total: number }>;
  /** Seed: chỉ TẠO huy hiệu còn thiếu theo `code` (không ghi đè bản admin đã sửa). Trả số tạo mới. */
  createMissing(rows: readonly BadgeCreateInput[]): Promise<number>;
}
