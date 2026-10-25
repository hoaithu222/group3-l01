import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { normalizeSearch } from "../../../core/utils/normalize";
import type { Badge, BadgeCreateInput, BadgePatch, BadgeRarityValue } from "../entities/gamification.interface";
import type { BadgeListParams, IBadgeRepository } from "./badge.repository.interface";
import { isPrismaUniqueViolation, UniqueViolationError, type TxHandle } from "./tx";

type BadgeRecord = Awaited<ReturnType<typeof prisma.badge.findFirstOrThrow>>;

export function toBadge(r: BadgeRecord): Badge {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    emoji: r.emoji,
    iconAssetId: r.iconAssetId,
    criteria: r.criteria,
    counters: r.counters,
    rarity: r.rarity as BadgeRarityValue,
    isActive: r.isActive,
    order: r.order,
    version: r.version,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

const ORDER: Prisma.BadgeOrderByWithRelationInput[] = [{ order: "asc" }, { code: "asc" }];

/** Trần số huy hiệu quét khi tìm theo tên (đủ lớn cho mọi danh mục thực tế; vượt thì chỉ tìm trong phần đầu theo `order`). */
const SEARCH_SCAN_MAX = 1000;

function createData(input: BadgeCreateInput): Prisma.BadgeCreateInput {
  return {
    code: input.code,
    name: input.name,
    description: input.description,
    // Trường tuỳ chọn ghi `null` TƯỜNG MINH (Mongo: vắng mặt ≠ null).
    emoji: input.emoji ?? null,
    iconAssetId: input.iconAssetId ?? null,
    criteria: input.criteria as Prisma.InputJsonValue,
    counters: input.counters,
    rarity: input.rarity,
    isActive: input.isActive ?? true,
    order: input.order,
    createdBy: input.createdBy ?? null,
  };
}

export class PrismaBadgeRepository implements IBadgeRepository {
  async listActive(): Promise<Badge[]> {
    return (await prisma.badge.findMany({ where: { isActive: true }, orderBy: ORDER })).map(toBadge);
  }

  async listActiveByCounters(keys: readonly string[]): Promise<Badge[]> {
    if (keys.length === 0) return [];
    return (await prisma.badge.findMany({ where: { isActive: true, counters: { hasSome: [...keys] } }, orderBy: ORDER })).map(toBadge);
  }

  async findById(id: string): Promise<Badge | null> {
    const r = await prisma.badge.findUnique({ where: { id } });
    return r ? toBadge(r) : null;
  }

  async findByCode(code: string): Promise<Badge | null> {
    const r = await prisma.badge.findUnique({ where: { code } });
    return r ? toBadge(r) : null;
  }

  async findByIds(ids: readonly string[]): Promise<Badge[]> {
    if (ids.length === 0) return [];
    return (await prisma.badge.findMany({ where: { id: { in: [...ids] } }, orderBy: ORDER })).map(toBadge);
  }

  async create(input: BadgeCreateInput, tx?: TxHandle): Promise<Badge> {
    try {
      return toBadge(await (tx ?? prisma).badge.create({ data: createData(input) }));
    } catch (err) {
      if (isPrismaUniqueViolation(err)) throw new UniqueViolationError("Badge.code");
      throw err;
    }
  }

  async updateIf(id: string, expectedVersion: number, patch: BadgePatch, tx?: TxHandle): Promise<Badge | null> {
    const { criteria, ...rest } = patch;
    const db = tx ?? prisma;
    const res = await db.badge.updateMany({
      where: { id, version: expectedVersion },
      data: { ...rest, ...(criteria !== undefined && { criteria: criteria as Prisma.InputJsonValue }), version: { increment: 1 } },
    });
    if (res.count === 0) return null;
    const r = await db.badge.findUnique({ where: { id } });
    return r ? toBadge(r) : null;
  }

  async listPage(params: BadgeListParams): Promise<{ rows: Badge[]; total: number }> {
    const where: Prisma.BadgeWhereInput = params.isActive === undefined ? {} : { isActive: params.isActive };
    const needle = params.q ? normalizeSearch(params.q) : "";
    if (needle) {
      // `Badge` KHÔNG có cột tên đã chuẩn hoá (schema p4-03 không đổi) nên `contains` của Mongo sẽ phân biệt dấu ("cham chi" ≠ "Chăm chỉ").
      // Danh mục huy hiệu nhỏ (chục → vài trăm) ⇒ đọc theo `order` rồi lọc không dấu trong bộ nhớ, phân trang SAU khi lọc để `total` đúng.
      const all = await prisma.badge.findMany({ where, orderBy: ORDER, take: SEARCH_SCAN_MAX });
      const matched = all.filter((b) => normalizeSearch(b.name).includes(needle));
      const start = (params.page - 1) * params.limit;
      return { rows: matched.slice(start, start + params.limit).map(toBadge), total: matched.length };
    }
    const [rows, total] = await Promise.all([
      prisma.badge.findMany({ where, orderBy: ORDER, skip: (params.page - 1) * params.limit, take: params.limit }),
      prisma.badge.count({ where }),
    ]);
    return { rows: rows.map(toBadge), total };
  }

  async createMissing(rows: readonly BadgeCreateInput[]): Promise<number> {
    const have = new Set((await prisma.badge.findMany({ select: { code: true } })).map((b) => b.code));
    let created = 0;
    for (const row of rows.filter((r) => !have.has(r.code))) {
      try {
        await prisma.badge.create({ data: createData(row) });
        created += 1;
      } catch (err) {
        if (!isPrismaUniqueViolation(err)) throw err;
      }
    }
    return created;
  }
}
