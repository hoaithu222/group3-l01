import type { InventoryItem, ShopItem, ShopItemKindValue, ShopItemWrite } from "../entities/coins.interface";
import { tick, type InMemoryCoinsStore } from "./coins-store.inmemory";
import type { IInventoryRepository, IShopItemRepository, ShopItemPatch } from "./shop.repository.interface";
import { UniqueViolationError, type TxHandle } from "./tx";

const byKindPrice = (a: ShopItem, b: ShopItem): number => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.price - b.price || (a.code < b.code ? -1 : 1));

export class InMemoryShopItemRepository implements IShopItemRepository {
  constructor(private readonly store: InMemoryCoinsStore) {}

  async listActive(kind?: ShopItemKindValue): Promise<ShopItem[]> {
    await tick();
    return [...this.store.items.values()].filter((i) => i.isActive && (!kind || i.kind === kind)).sort(byKindPrice).map((i) => ({ ...i }));
  }

  async listAll(kind?: ShopItemKindValue): Promise<ShopItem[]> {
    await tick();
    return [...this.store.items.values()].filter((i) => !kind || i.kind === kind).sort(byKindPrice).map((i) => ({ ...i }));
  }

  async find(id: string, _tx?: TxHandle): Promise<ShopItem | null> {
    await tick();
    const i = this.store.items.get(id);
    return i ? { ...i } : null;
  }

  async findMany(ids: readonly string[]): Promise<ShopItem[]> {
    await tick();
    return ids.flatMap((id) => {
      const i = this.store.items.get(id);
      return i ? [{ ...i }] : [];
    });
  }

  async create(data: ShopItemWrite, actorId: string): Promise<ShopItem | null> {
    await tick();
    if ([...this.store.items.values()].some((i) => i.code === data.code)) return null;
    const item: ShopItem = { id: this.store.nextId(), ...data, version: 1, updatedBy: actorId, createdAt: this.store.now() };
    this.store.items.set(item.id, item);
    return { ...item };
  }

  async updateIf(id: string, expectedVersion: number, patch: ShopItemPatch, actorId: string): Promise<ShopItem | null> {
    await tick();
    const i = this.store.items.get(id);
    if (!i || i.version !== expectedVersion) return null;
    Object.assign(i, patch, { version: i.version + 1, updatedBy: actorId });
    return { ...i };
  }
}

export class InMemoryInventoryRepository implements IInventoryRepository {
  constructor(private readonly store: InMemoryCoinsStore) {}

  async findByItem(userId: string, itemId: string, _tx?: TxHandle): Promise<InventoryItem | null> {
    await tick();
    const r = this.store.inventory.find((x) => x.userId === userId && x.itemId === itemId);
    return r ? { ...r } : null;
  }

  async findById(id: string, _tx?: TxHandle): Promise<InventoryItem | null> {
    await tick();
    const r = this.store.inventory.find((x) => x.id === id);
    return r ? { ...r } : null;
  }

  async listByUser(userId: string, kind?: ShopItemKindValue): Promise<InventoryItem[]> {
    await tick();
    return this.store.inventory
      .filter((x) => x.userId === userId && (!kind || x.kind === kind))
      .sort((a, b) => b.acquiredAt.getTime() - a.acquiredAt.getTime() || (a.id < b.id ? 1 : -1))
      .map((x) => ({ ...x }));
  }

  async create(input: { userId: string; itemId: string; kind: ShopItemKindValue }, _tx: TxHandle): Promise<InventoryItem> {
    await tick();
    if (this.store.inventory.some((x) => x.userId === input.userId && x.itemId === input.itemId)) throw new UniqueViolationError("UserInventory");
    const row: InventoryItem = { id: this.store.nextId(), ...input, equipped: false, acquiredAt: this.store.now() };
    this.store.inventory.push(row);
    return { ...row };
  }

  async unequipKind(userId: string, kind: ShopItemKindValue, _tx: TxHandle): Promise<void> {
    await tick();
    for (const x of this.store.inventory) if (x.userId === userId && x.kind === kind) x.equipped = false;
  }

  async setEquipped(id: string, userId: string, equipped: boolean, _tx: TxHandle): Promise<InventoryItem | null> {
    await tick();
    const r = this.store.inventory.find((x) => x.id === id && x.userId === userId);
    if (!r) return null;
    r.equipped = equipped;
    return { ...r };
  }

  async equippedByUsers(userIds: readonly string[]): Promise<InventoryItem[]> {
    await tick();
    const wanted = new Set(userIds);
    return this.store.inventory.filter((x) => wanted.has(x.userId) && x.equipped).map((x) => ({ ...x }));
  }

  async countByItem(): Promise<Map<string, number>> {
    await tick();
    const out = new Map<string, number>();
    for (const x of this.store.inventory) out.set(x.itemId, (out.get(x.itemId) ?? 0) + 1);
    return out;
  }
}
