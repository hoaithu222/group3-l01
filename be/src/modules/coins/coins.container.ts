import { PrismaCoinsDirectory } from "./repositories/directory";
import { PrismaCoinEarnEventRepository } from "./repositories/earn-event.repository.prisma";
import { PrismaCoinLedgerRepository } from "./repositories/ledger.repository.prisma";
import { PrismaListingRepository } from "./repositories/listing.repository.prisma";
import { PrismaMarketplaceDirectory } from "./repositories/marketplace-directory";
import { PrismaPurchaseRepository } from "./repositories/purchase.repository.prisma";
import { PrismaCoinQuestRepository, PrismaQuestProgressRepository } from "./repositories/quest.repository.prisma";
import { PrismaCoinRuleRepository } from "./repositories/rule.repository.prisma";
import { PrismaInventoryRepository, PrismaShopItemRepository } from "./repositories/shop.repository.prisma";
import { PrismaTxRunner } from "./repositories/tx";
import { PrismaCoinWalletRepository } from "./repositories/wallet.repository.prisma";
import { PrismaContentAccessPort } from "./ports/content-access.port";
import { CoinCatalogCache } from "./services/coin-catalog.service";
import { CoinEarnService } from "./services/coin-earn.service";
import { CoinLedgerService } from "./services/coin-ledger.service";
import { CoinQuestService } from "./services/coin-quest.service";
import { CoinWalletService } from "./services/coin-wallet.service";
import { PromCoinsMetrics, RedisReconcileStore, RuntimeCoinsConfig, ServiceCoinsAudit, SocketCoinsEmitter } from "./services/coins.ports";
import { EconomyAdminService } from "./services/economy-admin.service";
import { EconomyCatalogAdminService } from "./services/economy-catalog-admin.service";
import { EconomyReconcileService } from "./services/economy-reconcile.service";
import { EquippedItemsReader } from "./services/equipped-items.reader";
import { MarketplaceService } from "./services/marketplace.service";
import { RuntimeMarketplaceConfig } from "./services/marketplace.ports";
import { ShopService } from "./services/shop.service";

/**
 * Nối dây DI cho module `coins` — dùng CHUNG bởi `coins.routes.ts`, `admin-economy.routes.ts` và các job (tiến trình worker riêng không import routes nên dùng `getCoinsContainer()`). Không có DI
 * container trong codebase (mẫu `whiteboards.container.ts`).
 */
export function createCoinsContainer() {
  const tx = new PrismaTxRunner();
  const wallets = new PrismaCoinWalletRepository();
  const ledgerRepo = new PrismaCoinLedgerRepository();
  const earnEvents = new PrismaCoinEarnEventRepository();
  const rules = new PrismaCoinRuleRepository();
  const quests = new PrismaCoinQuestRepository();
  const progress = new PrismaQuestProgressRepository();
  const items = new PrismaShopItemRepository();
  const inventory = new PrismaInventoryRepository();
  const directory = new PrismaCoinsDirectory();
  const config = new RuntimeCoinsConfig();
  const emitter = new SocketCoinsEmitter();
  const metrics = new PromCoinsMetrics();
  const audit = new ServiceCoinsAudit();
  const reconcileStore = new RedisReconcileStore();
  const listings = new PrismaListingRepository();
  const purchases = new PrismaPurchaseRepository();
  const marketplaceDirectory = new PrismaMarketplaceDirectory();
  const marketplaceConfig = new RuntimeMarketplaceConfig();
  const content = new PrismaContentAccessPort(tx);

  const ledger = new CoinLedgerService({ wallets, ledger: ledgerRepo, tx, config });
  const catalog = new CoinCatalogCache(rules, quests);
  const walletQuery = new CoinWalletService({ wallets, ledger: ledgerRepo, earnEvents, directory, config });

  return {
    ledger,
    catalog,
    walletQuery,
    earn: new CoinEarnService({ catalog, earnEvents, progress, ledger, directory, tx, config, emitter, metrics }),
    quests: new CoinQuestService({ catalog, quests, progress, ledger, directory, tx, emitter }),
    shop: new ShopService({ items, inventory, ledger, tx, emitter }),
    admin: new EconomyAdminService({ wallets, ledgerRepo, ledger, walletQuery, items, inventory, directory, audit, config, emitter, reconcile: reconcileStore }),
    catalogAdmin: new EconomyCatalogAdminService({ items, inventory, rules, quests, earnEvents, catalog, audit }),
    reconcile: new EconomyReconcileService({ wallets, ledger: ledgerRepo, metrics, store: reconcileStore }),
    equipped: new EquippedItemsReader(inventory, items),
    marketplace: new MarketplaceService({ listings, purchases, wallets, ledger, content, directory: marketplaceDirectory, config: marketplaceConfig, tx, emitter, audit }),
  };
}

export type CoinsContainer = ReturnType<typeof createCoinsContainer>;

let cached: CoinsContainer | null = null;

/** Singleton lười cho job/route (tránh dựng lại repo/service mỗi lần). */
export function getCoinsContainer(): CoinsContainer {
  cached ??= createCoinsContainer();
  return cached;
}
