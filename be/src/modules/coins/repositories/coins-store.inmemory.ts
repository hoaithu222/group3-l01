import type {
  CoinEarnEvent,
  CoinQuest,
  CoinRule,
  CoinTransaction,
  CoinWallet,
  InventoryItem,
  MarketplaceListing,
  MarketplacePurchase,
  QuestProgress,
  ShopItem,
} from "../entities/coins.interface";
import type { Restorable } from "./tx.inmemory";

interface StoreState {
  wallets: Map<string, CoinWallet>;
  ledger: CoinTransaction[];
  earnEvents: CoinEarnEvent[];
  rules: Map<string, CoinRule>;
  quests: Map<string, CoinQuest>;
  progress: QuestProgress[];
  items: Map<string, ShopItem>;
  inventory: InventoryItem[];
  listings: Map<string, MarketplaceListing>;
  purchases: MarketplacePurchase[];
}

/**
 * "Cơ sở dữ liệu" trong bộ nhớ dùng chung cho các repository in-memory của `coins` (test): MỘT nơi giữ mọi collection để `InMemoryTxRunner` chụp/hoàn tác đồng loạt như rollback thật.
 * Các repository đọc `store.<collection>` mỗi lần gọi (không giữ tham chiếu) nên `restore` thay collection là đủ.
 */
export class InMemoryCoinsStore implements Restorable, StoreState {
  wallets = new Map<string, CoinWallet>();
  ledger: CoinTransaction[] = [];
  earnEvents: CoinEarnEvent[] = [];
  rules = new Map<string, CoinRule>();
  quests = new Map<string, CoinQuest>();
  progress: QuestProgress[] = [];
  items = new Map<string, ShopItem>();
  inventory: InventoryItem[] = [];
  listings = new Map<string, MarketplaceListing>();
  purchases: MarketplacePurchase[] = [];
  private seq = 0;
  /** Đồng hồ giả tăng dần từng mili-giây — thứ tự `at` tất định để test cursor. */
  private clock = Date.UTC(2026, 0, 1, 0, 0, 0);

  /** ObjectId giả 24 hex, tăng dần (sắp theo id = sắp theo thứ tự tạo). */
  nextId(): string {
    this.seq += 1;
    return this.seq.toString(16).padStart(24, "0");
  }

  now(): Date {
    this.clock += 1;
    return new Date(this.clock);
  }

  snapshot(): StoreState {
    return structuredClone({
      wallets: this.wallets,
      ledger: this.ledger,
      earnEvents: this.earnEvents,
      rules: this.rules,
      quests: this.quests,
      progress: this.progress,
      items: this.items,
      inventory: this.inventory,
      listings: this.listings,
      purchases: this.purchases,
    });
  }

  restore(snapshot: unknown): void {
    Object.assign(this, snapshot as StoreState);
  }
}

/** Nhường luồng một vi tác vụ — ép các lời gọi song song XEN KẼ giữa các bước repo (mô phỏng độ trễ I/O), để lộ lỗi đọc-rồi-ghi. */
export const tick = (): Promise<void> => Promise.resolve();
