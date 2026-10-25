/**
 * Bộ dựng dùng chung cho unit test của `coins` (KHÔNG phải test): repository in-memory dùng CHUNG một `InMemoryCoinsStore` (transaction giả hoàn tác được), cổng phụ trợ giả ghi lại lời gọi.
 * File test PHẢI tự khai `jest.mock` redis/logger nếu import trực tiếp module cần chúng (xem đầu các file test).
 */
import type { AuthUser } from "../../../../core/types/express";
import { newObjectId } from "../../../../core/utils/object-id";
import type { CoinQuest, CoinQuestMetric, CoinRule, CoinSourceTypeValue, CoinUser, ShopItem, ShopItemKindValue } from "../../entities/coins.interface";
import { InMemoryCoinsStore } from "../../repositories/coins-store.inmemory";
import type { ICoinsDirectory } from "../../repositories/directory";
import { InMemoryCoinEarnEventRepository } from "../../repositories/earn-event.repository.inmemory";
import { InMemoryCoinLedgerRepository } from "../../repositories/ledger.repository.inmemory";
import { InMemoryCoinQuestRepository, InMemoryQuestProgressRepository } from "../../repositories/quest.repository.inmemory";
import { InMemoryCoinRuleRepository } from "../../repositories/rule.repository.inmemory";
import { InMemoryInventoryRepository, InMemoryShopItemRepository } from "../../repositories/shop.repository.inmemory";
import { InMemoryTxRunner } from "../../repositories/tx.inmemory";
import { InMemoryCoinWalletRepository } from "../../repositories/wallet.repository.inmemory";
import { CoinCatalogCache } from "../../services/coin-catalog.service";
import { CoinEarnService } from "../../services/coin-earn.service";
import { CoinLedgerService } from "../../services/coin-ledger.service";
import { CoinQuestService } from "../../services/coin-quest.service";
import { CoinWalletService } from "../../services/coin-wallet.service";
import type { AuditInput, CoinsRuntimeLimits, CoinsUpdatedPayload, ICoinsAudit, ICoinsConfig, ICoinsEmitter, ICoinsMetrics, IReconcileStore, ReconcileReport } from "../../services/coins.ports";
import { EconomyAdminService } from "../../services/economy-admin.service";
import { EconomyCatalogAdminService } from "../../services/economy-catalog-admin.service";
import { EconomyReconcileService } from "../../services/economy-reconcile.service";
import { EquippedItemsReader } from "../../services/equipped-items.reader";
import { ShopService } from "../../services/shop.service";

export class FakeConfig implements ICoinsConfig {
  isEnabled = true;
  limitValues: CoinsRuntimeLimits = { dailyEarnCap: 200, adjustMax: 100_000, balanceMax: 1_000_000_000 };

  limits(): Promise<CoinsRuntimeLimits> {
    return Promise.resolve({ ...this.limitValues });
  }

  enabled(): Promise<boolean> {
    return Promise.resolve(this.isEnabled);
  }
}

export class FakeEmitter implements ICoinsEmitter {
  readonly events: Array<{ userId: string; payload: CoinsUpdatedPayload }> = [];

  updated(userId: string, payload: CoinsUpdatedPayload): void {
    this.events.push({ userId, payload });
  }
}

export class FakeAudit implements ICoinsAudit {
  readonly records: AuditInput[] = [];

  record(input: AuditInput): Promise<void> {
    this.records.push(input);
    return Promise.resolve();
  }
}

export class FakeMetrics implements ICoinsMetrics {
  readonly skipped: string[] = [];
  mismatch: number | null = null;

  earnSkipped(reason: string): void {
    this.skipped.push(reason);
  }

  reconcileMismatch(count: number): void {
    this.mismatch = count;
  }
}

export class FakeReconcileStore implements IReconcileStore {
  report: ReconcileReport | null = null;

  save(report: ReconcileReport): Promise<void> {
    this.report = report;
    return Promise.resolve();
  }

  last(): Promise<ReconcileReport | null> {
    return Promise.resolve(this.report);
  }
}

export class FakeDirectory implements ICoinsDirectory {
  readonly users = new Map<string, CoinUser>();

  getUser(userId: string): Promise<CoinUser | null> {
    return Promise.resolve(this.users.get(userId) ?? null);
  }
}

export const adminOf = (id = newObjectId()): AuthUser => ({ id, email: `${id}@e.com`, name: "Quản trị", role: "admin", permissions: [] });

/** Bộ dựng: mọi repository in-memory + service thật; `clock` chỉnh được để test ngày/khung bán/cache. */
export class CoinsHarness {
  readonly store = new InMemoryCoinsStore();
  readonly tx = new InMemoryTxRunner([this.store]);
  readonly wallets = new InMemoryCoinWalletRepository(this.store);
  readonly ledgerRepo = new InMemoryCoinLedgerRepository(this.store);
  readonly earnEvents = new InMemoryCoinEarnEventRepository(this.store);
  readonly rules = new InMemoryCoinRuleRepository(this.store);
  readonly questRepo = new InMemoryCoinQuestRepository(this.store);
  readonly progress = new InMemoryQuestProgressRepository(this.store);
  readonly items = new InMemoryShopItemRepository(this.store);
  readonly inventory = new InMemoryInventoryRepository(this.store);
  readonly directory = new FakeDirectory();
  readonly config = new FakeConfig();
  readonly emitter = new FakeEmitter();
  readonly audit = new FakeAudit();
  readonly metrics = new FakeMetrics();
  readonly reconcileStore = new FakeReconcileStore();
  /** Đồng hồ giả (ms) — mặc định 2026-03-10 05:00 UTC (= 12:00 giờ VN). */
  clockMs = Date.UTC(2026, 2, 10, 5, 0, 0);
  private readonly now = (): Date => new Date(this.clockMs);

  readonly ledger = new CoinLedgerService({ wallets: this.wallets, ledger: this.ledgerRepo, tx: this.tx, config: this.config });
  readonly catalog = new CoinCatalogCache(this.rules, this.questRepo, () => this.clockMs);
  readonly walletQuery = new CoinWalletService({ wallets: this.wallets, ledger: this.ledgerRepo, earnEvents: this.earnEvents, directory: this.directory, config: this.config, now: this.now });
  readonly earn = new CoinEarnService({
    catalog: this.catalog,
    earnEvents: this.earnEvents,
    progress: this.progress,
    ledger: this.ledger,
    directory: this.directory,
    tx: this.tx,
    config: this.config,
    emitter: this.emitter,
    metrics: this.metrics,
  });
  readonly quests = new CoinQuestService({ catalog: this.catalog, quests: this.questRepo, progress: this.progress, ledger: this.ledger, directory: this.directory, tx: this.tx, emitter: this.emitter, now: this.now });
  readonly shop = new ShopService({ items: this.items, inventory: this.inventory, ledger: this.ledger, tx: this.tx, emitter: this.emitter, now: this.now });
  readonly admin = new EconomyAdminService({
    wallets: this.wallets,
    ledgerRepo: this.ledgerRepo,
    ledger: this.ledger,
    walletQuery: this.walletQuery,
    items: this.items,
    inventory: this.inventory,
    directory: this.directory,
    audit: this.audit,
    config: this.config,
    emitter: this.emitter,
    reconcile: this.reconcileStore,
    now: this.now,
  });
  readonly catalogAdmin = new EconomyCatalogAdminService({ items: this.items, inventory: this.inventory, rules: this.rules, quests: this.questRepo, earnEvents: this.earnEvents, catalog: this.catalog, audit: this.audit, now: this.now });
  readonly reconcile = new EconomyReconcileService({ wallets: this.wallets, ledger: this.ledgerRepo, metrics: this.metrics, store: this.reconcileStore, now: this.now });
  readonly equipped = new EquippedItemsReader(this.inventory, this.items);

  addUser(over: Partial<CoinUser> = {}): string {
    const id = newObjectId();
    this.directory.users.set(id, { timezone: "Asia/Ho_Chi_Minh", status: "ACTIVE", ...over });
    return id;
  }

  /** Cấp xu cho test bằng đường sổ cái thật (không ghi thẳng vào ví) — dòng `ADJUST_ADMIN` có `refId` duy nhất. */
  async fund(userId: string, amount: number): Promise<void> {
    await this.ledger.postAtomic({ userId, amount, type: "ADJUST_ADMIN", refType: "ADMIN", refId: `fund-${newObjectId()}`, note: "nạp cho test" });
  }

  async balanceOf(userId: string): Promise<number> {
    return (await this.wallets.find(userId))?.balance ?? 0;
  }

  addRule(sourceType: CoinSourceTypeValue, over: Partial<CoinRule> = {}): CoinRule {
    const rule: CoinRule = { id: this.store.nextId(), sourceType, coins: 5, dailyCap: null, isActive: true, version: 1, updatedBy: null, updatedAt: this.store.now(), ...over };
    this.store.rules.set(sourceType, rule);
    this.catalog.invalidate();
    return rule;
  }

  addQuest(over: Partial<CoinQuest> & { metric?: CoinQuestMetric } = {}): CoinQuest {
    const quest: CoinQuest = {
      id: this.store.nextId(),
      code: `quest-${this.store.nextId()}`,
      title: "Hoàn thành thẻ",
      description: "Hoàn thành thẻ công việc",
      metric: "tasksDone",
      target: 2,
      coins: 15,
      isActive: true,
      order: 0,
      version: 1,
      updatedBy: null,
      updatedAt: this.store.now(),
      ...over,
    };
    this.store.quests.set(quest.id, quest);
    this.catalog.invalidate();
    return quest;
  }

  addItem(over: Partial<ShopItem> & { kind?: ShopItemKindValue } = {}): ShopItem {
    const item: ShopItem = {
      id: this.store.nextId(),
      code: `item-${this.store.nextId()}`,
      name: "Khung vàng",
      kind: "AVATAR_FRAME",
      price: 100,
      assetId: null,
      data: { color: "#F5B301", width: 3 },
      isActive: true,
      availableFrom: null,
      availableTo: null,
      version: 1,
      updatedBy: null,
      createdAt: this.store.now(),
      ...over,
    };
    this.store.items.set(item.id, item);
    return item;
  }
}

/** Payload `xp.awarded` hợp lệ (đúng hợp đồng `xpAwardedSchema` của `shared/events/domain-events`). */
export function xpAwarded(userId: string, over: Partial<{ sourceType: string; sourceId: string; xp: number; at: string; workspaceId: string | null }> = {}) {
  return {
    event: "xp.awarded" as const,
    userId,
    sourceType: "TASK_COMPLETED",
    sourceId: newObjectId(),
    workspaceId: null,
    xp: 10,
    at: new Date(Date.UTC(2026, 2, 10, 5, 0, 0)).toISOString(),
    schemaVersion: 1,
    ...over,
  };
}
