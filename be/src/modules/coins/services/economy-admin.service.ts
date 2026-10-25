import { DEFAULT_TIME_ZONE, addDaysToLocalDate, localDate, localDayRangeUtc } from "../../../core/utils/local-date";
import { ValidationError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import type { CoinTxTypeValue } from "../entities/coins.interface";
import { coinErrors } from "../coins.errors";
import type { ICoinsDirectory } from "../repositories/directory";
import type { ICoinLedgerRepository, LedgerTypeTotal } from "../repositories/ledger.repository.interface";
import type { IInventoryRepository, IShopItemRepository } from "../repositories/shop.repository.interface";
import type { ICoinWalletRepository } from "../repositories/wallet.repository.interface";
import type { CoinLedgerService } from "./coin-ledger.service";
import type { CoinWalletService, TxQuery } from "./coin-wallet.service";
import type { ICoinsAudit, ICoinsConfig, ICoinsEmitter, IReconcileStore, ReconcileReport } from "./coins.ports";

export interface EconomyAdminDeps {
  wallets: ICoinWalletRepository;
  ledgerRepo: ICoinLedgerRepository;
  ledger: CoinLedgerService;
  walletQuery: CoinWalletService;
  items: IShopItemRepository;
  inventory: IInventoryRepository;
  directory: ICoinsDirectory;
  audit: ICoinsAudit;
  config: ICoinsConfig;
  emitter: ICoinsEmitter;
  reconcile: IReconcileStore;
  now?: () => Date;
}

export interface DayTotals {
  /** Xu MỚI phát ra (EARN_EVENT + EARN_QUEST). Chuyển giữa người dùng (EARN_SALE) không phải phát hành. */
  issued: number;
  /** Xu người dùng đã tiêu (SPEND_SHOP + SPEND_MARKETPLACE), số dương. */
  spent: number;
  /** Xu bị đốt (BURN_FEE), số dương. */
  burned: number;
  /** Điều chỉnh thủ công ròng của admin (có dấu). */
  adjusted: number;
}

export interface OverviewDto {
  days: number;
  totals: DayTotals;
  perDay: Array<{ date: string } & DayTotals>;
  /** Σ số dư mọi ví — số xu đang lưu hành. */
  circulating: number;
  topItems: Array<{ itemId: string; code: string; name: string; owners: number }>;
  /** Lần đối soát gần nhất (`null` = chưa chạy / báo cáo đã hết hạn). `mismatched > 0` ⇒ cảnh báo. */
  reconcile: ReconcileReport | null;
}

const sumOf = (t: Map<CoinTxTypeValue, LedgerTypeTotal>, type: CoinTxTypeValue): number => t.get(type)?.sum ?? 0;

function summarize(t: Map<CoinTxTypeValue, LedgerTypeTotal>): DayTotals {
  return {
    issued: sumOf(t, "EARN_EVENT") + sumOf(t, "EARN_QUEST"),
    spent: -(sumOf(t, "SPEND_SHOP") + sumOf(t, "SPEND_MARKETPLACE")),
    burned: -sumOf(t, "BURN_FEE"),
    adjusted: sumOf(t, "ADJUST_ADMIN"),
  };
}

const ZERO: DayTotals = { issued: 0, spent: 0, burned: 0, adjusted: 0 };

/**
 * Admin kinh tế xu — phần TIỀN (p7-02 be.md §4 `/admin/economy`): tổng quan, xem ví/lịch sử một người, điều chỉnh có lý do. Quyền do route kiểm (`gamification:view|update`); mọi ghi có `reason` + audit.
 * Điều chỉnh đi qua CÙNG sổ cái với mọi thay đổi số dư (`postAtomic`): idempotent theo `Idempotency-Key` (`refId`, unique theo người ⇒ gửi lại/hai admin cùng khoá không cộng hai lần), số dư KHÔNG âm (`COIN_001`),
 * không vượt trần (`COIN_009`), dòng sổ cái mang `actorId` + lý do nên là vết kiểm toán ngay cả khi audit log lỡ ghi.
 */
export class EconomyAdminService {
  private readonly now: () => Date;

  constructor(private readonly d: EconomyAdminDeps) {
    this.now = d.now ?? (() => new Date());
  }

  async overview(days: number): Promise<OverviewDto> {
    // Ngày theo giờ VN (một khu vực vận hành): mỗi ngày một truy vấn gộp theo loại — `days` bị chặn ở `LIMITS.coins.overviewMaxDays`.
    const today = localDate(this.now(), DEFAULT_TIME_ZONE);
    const dates = Array.from({ length: days }, (_, i) => addDaysToLocalDate(today, i - (days - 1)));
    const perDay = await Promise.all(
      dates.map(async (date) => {
        const { from, to } = localDayRangeUtc(date, DEFAULT_TIME_ZONE);
        return { date, ...summarize(await this.d.ledgerRepo.totalsByType(from, to)) };
      })
    );
    const totals = perDay.reduce<DayTotals>((acc, r) => ({ issued: acc.issued + r.issued, spent: acc.spent + r.spent, burned: acc.burned + r.burned, adjusted: acc.adjusted + r.adjusted }), ZERO);
    const [circulating, owners, reconcile] = await Promise.all([this.d.wallets.totalBalance(), this.d.inventory.countByItem(), this.d.reconcile.last().catch(() => null)]);
    const top = [...owners.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const items = new Map((await this.d.items.findMany(top.map(([id]) => id))).map((i) => [i.id, i] as const));
    const topItems = top.flatMap(([itemId, count]) => {
      const item = items.get(itemId);
      return item ? [{ itemId, code: item.code, name: item.name, owners: count }] : [];
    });
    return { days, totals, perDay, circulating, topItems, reconcile };
  }

  /** Ví + hạn mức hôm nay của MỘT người (hỗ trợ). 404 khi người dùng không tồn tại/đã ẩn danh hoá. */
  async userWallet(userId: string) {
    await this.assertUser(userId);
    return this.d.walletQuery.summary(userId);
  }

  async userTransactions(userId: string, query: TxQuery) {
    await this.assertUser(userId);
    return this.d.walletQuery.adminTransactions(userId, query);
  }

  /** `idempotencyKey` = header `Idempotency-Key` (bắt buộc ở route). Trả `delta` THỰC của dòng sổ cái (khi gửi lại khoá cũ với số khác, số của lần đầu). */
  async adjust(actor: AuthUser, userId: string, dto: { amount: number; reason: string }, idempotencyKey: string): Promise<{ balance: number; delta: number; replayed: boolean }> {
    const limits = await this.d.config.limits();
    if (Math.abs(dto.amount) > limits.adjustMax) throw new ValidationError(`Mức điều chỉnh tối đa hiện tại là ${String(limits.adjustMax)} xu`, { amount: [`Không quá ${String(limits.adjustMax)} xu`] });
    await this.assertUser(userId);
    const res = await this.d.ledger.postAtomic({ userId, amount: dto.amount, type: "ADJUST_ADMIN", refType: "ADMIN", refId: idempotencyKey, note: dto.reason, actorId: actor.id });
    if (!res.replayed) {
      await this.d.audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        action: "coins.adjust",
        targetType: "CoinWallet",
        targetId: userId,
        reason: dto.reason,
        metadata: { amount: dto.amount, balanceAfter: res.entry.balanceAfter, transactionId: res.entry.id },
      });
      this.d.emitter.updated(userId, { coins: { balance: res.balance, delta: dto.amount, reason: "ADJUST" } });
    }
    return { balance: res.balance, delta: res.entry.amount, replayed: res.replayed };
  }

  private async assertUser(userId: string): Promise<void> {
    const user = await this.d.directory.getUser(userId);
    if (!user || user.status === "ANONYMIZED") throw coinErrors.notFound("Không tìm thấy người dùng");
  }
}
