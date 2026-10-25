import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { InventoryItem, ShopItem, ShopItemKindValue, ShopItemWrite } from "../entities/coins.interface";
import type { IInventoryRepository, IShopItemRepository, ShopItemPatch } from "./shop.repository.interface";
import { isPrismaUniqueViolation, UniqueViolationError, type TxHandle } from "./tx";

type ItemRecord = Awaited<ReturnType<typeof prisma.shopItem.findFirstOrThrow>>;
type InventoryRecord = Awaited<ReturnType<typeof prisma.userInventory.findFirstOrThrow>>;

const isRecord = (v: Prisma.JsonValue | null): v is Prisma.JsonObject => typeof v === "object" && v !== null && !Array.isArray(v);

export function toShopItem(r: ItemRecord): ShopItem {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    kind: r.kind,
    price: r.price,
    assetId: r.assetId,
    data: isRecord(r.data) ? (r.data as Record<string, unknown>) : null,
    isActive: r.isActive,
    availableFrom: r.availableFrom,
    availableTo: r.availableTo,
    version: r.version,
    updatedBy: r.updatedBy,
    createdAt: r.createdAt,
  };
}

const toInventory = (r: InventoryRecord): InventoryItem => ({ id: r.id, userId: r.userId, itemId: r.itemId, kind: r.kind, equipped: r.equipped, acquiredAt: r.acquiredAt });

/** `data` (Json?) — với MongoDB kiểu input của Prisma nhận `null` JS trực tiếp (không dùng `Prisma.JsonNull`). Ép kiểu MỘT chỗ để create/update dùng chung. */
const jsonOf = (data: Record<string, unknown> | null): Prisma.InputJsonObject | null => data as Prisma.InputJsonObject | null;

export class PrismaShopItemRepository implements IShopItemRepository {
  async listActive(kind?: ShopItemKindValue): Promise<ShopItem[]> {
    return (await prisma.shopItem.findMany({ where: { isActive: true, ...(kind && { kind }) }, orderBy: [{ kind: "asc" }, { price: "asc" }, { code: "asc" }] })).map(toShopItem);
  }

  async listAll(kind?: ShopItemKindValue): Promise<ShopItem[]> {
    return (await prisma.shopItem.findMany({ where: kind ? { kind } : {}, orderBy: [{ kind: "asc" }, { price: "asc" }, { code: "asc" }] })).map(toShopItem);
  }

  async find(id: string, tx?: TxHandle): Promise<ShopItem | null> {
    const r = await (tx ?? prisma).shopItem.findUnique({ where: { id } });
    return r ? toShopItem(r) : null;
  }

  async findMany(ids: readonly string[]): Promise<ShopItem[]> {
    if (ids.length === 0) return [];
    return (await prisma.shopItem.findMany({ where: { id: { in: [...ids] } } })).map(toShopItem);
  }

  async create(data: ShopItemWrite, actorId: string): Promise<ShopItem | null> {
    try {
      // `assetId`/`availableFrom`/`availableTo`/`data` ghi `null` TƯỜNG MINH (Mongo: vắng mặt ≠ null).
      return toShopItem(await prisma.shopItem.create({ data: { ...data, data: jsonOf(data.data), updatedBy: actorId } }));
    } catch (err) {
      if (isPrismaUniqueViolation(err)) return null;
      throw err;
    }
  }

  async updateIf(id: string, expectedVersion: number, patch: ShopItemPatch, actorId: string): Promise<ShopItem | null> {
    const { data, ...scalars } = patch;
    const res = await prisma.shopItem.updateMany({
      where: { id, version: expectedVersion },
      data: { ...scalars, ...(data !== undefined && { data: jsonOf(data) }), updatedBy: actorId, version: { increment: 1 } },
    });
    return res.count > 0 ? this.find(id) : null;
  }
}

export class PrismaInventoryRepository implements IInventoryRepository {
  async findByItem(userId: string, itemId: string, tx?: TxHandle): Promise<InventoryItem | null> {
    const r = await (tx ?? prisma).userInventory.findUnique({ where: { userId_itemId: { userId, itemId } } });
    return r ? toInventory(r) : null;
  }

  async findById(id: string, tx?: TxHandle): Promise<InventoryItem | null> {
    const r = await (tx ?? prisma).userInventory.findUnique({ where: { id } });
    return r ? toInventory(r) : null;
  }

  async listByUser(userId: string, kind?: ShopItemKindValue): Promise<InventoryItem[]> {
    return (await prisma.userInventory.findMany({ where: { userId, ...(kind && { kind }) }, orderBy: [{ acquiredAt: "desc" }, { id: "desc" }] })).map(toInventory);
  }

  async create(input: { userId: string; itemId: string; kind: ShopItemKindValue }, tx: TxHandle): Promise<InventoryItem> {
    try {
      return toInventory(await tx.userInventory.create({ data: { ...input, equipped: false } }));
    } catch (err) {
      if (isPrismaUniqueViolation(err)) throw new UniqueViolationError("UserInventory");
      throw err;
    }
  }

  async unequipKind(userId: string, kind: ShopItemKindValue, tx: TxHandle): Promise<void> {
    await tx.userInventory.updateMany({ where: { userId, kind }, data: { equipped: false } });
  }

  async setEquipped(id: string, userId: string, equipped: boolean, tx: TxHandle): Promise<InventoryItem | null> {
    const res = await tx.userInventory.updateMany({ where: { id, userId }, data: { equipped } });
    return res.count > 0 ? this.findById(id, tx) : null;
  }

  async equippedByUsers(userIds: readonly string[]): Promise<InventoryItem[]> {
    if (userIds.length === 0) return [];
    return (await prisma.userInventory.findMany({ where: { userId: { in: [...userIds] }, equipped: true } })).map(toInventory);
  }

  async countByItem(): Promise<Map<string, number>> {
    const rows = await prisma.userInventory.groupBy({ by: ["itemId"], _count: { _all: true } });
    return new Map(rows.map((r) => [r.itemId, r._count._all]));
  }
}
