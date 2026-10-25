import { LIMITS } from "../../../core/constants/limits";
import { createContextLogger } from "../../../infrastructure/logger";
import type { ICoinLedgerRepository } from "../repositories/ledger.repository.interface";
import type { ICoinWalletRepository } from "../repositories/wallet.repository.interface";
import type { ICoinsMetrics, IReconcileStore, ReconcileReport } from "./coins.ports";

const SAMPLE_MAX = 20;
const log = createContextLogger({ service: "EconomyReconcile" });

export interface ReconcileDeps {
  wallets: ICoinWalletRepository;
  ledger: ICoinLedgerRepository;
  metrics: ICoinsMetrics;
  store: IReconcileStore;
  now?: () => Date;
  /** Cỡ trang ví mỗi lượt quét (mặc định `LIMITS.coins.reconcileBatch`); test đặt nhỏ để kiểm phân trang. */
  batchSize?: number;
}

/**
 * Đối soát hằng đêm (p7-02 be.md §5 "Reconcile", COIN-04): với mỗi ví so `balance` với Σ `amount` của sổ cái (nguồn sự thật). LỆCH ⇒ chỉ CẢNH BÁO (gauge `coins_reconcile_mismatch`, log lỗi với SỐ LƯỢNG, báo
 * cáo ở Redis cho admin) — KHÔNG tự sửa: sửa tay số dư/sổ cái phải là quyết định của người, bằng dòng bù `ADJUST_ADMIN` có lý do + audit. Ví lệch được KIỂM LẠI một lần (đọc lại ví + tổng sổ cái)
 * trước khi tính: một giao dịch commit giữa lúc đọc trang ví và lúc cộng sổ cái sẽ làm lệch giả; lệch thật thì vẫn còn ở lần đọc thứ hai.
 */
export class EconomyReconcileService {
  private readonly now: () => Date;
  private readonly batch: number;

  constructor(private readonly d: ReconcileDeps) {
    this.now = d.now ?? (() => new Date());
    this.batch = d.batchSize ?? LIMITS.coins.reconcileBatch;
  }

  async run(): Promise<ReconcileReport> {
    let checked = 0;
    const suspects: string[] = [];
    let after: string | undefined;
    for (;;) {
      const page = await this.d.wallets.listPage({ afterUserId: after, limit: this.batch });
      if (page.length === 0) break;
      const sums = await this.d.ledger.sumByUsers(page.map((w) => w.userId));
      for (const w of page) if ((sums.get(w.userId) ?? 0) !== w.balance) suspects.push(w.userId);
      checked += page.length;
      after = page[page.length - 1]?.userId;
      if (page.length < this.batch) break;
    }

    const confirmed: string[] = [];
    for (const userId of suspects) {
      const [wallet, sums] = await Promise.all([this.d.wallets.find(userId), this.d.ledger.sumByUsers([userId])]);
      if (wallet && wallet.balance !== (sums.get(userId) ?? 0)) confirmed.push(userId);
    }

    const report: ReconcileReport = { at: this.now().toISOString(), checked, mismatched: confirmed.length, sampleUserIds: confirmed.slice(0, SAMPLE_MAX) };
    this.d.metrics.reconcileMismatch(report.mismatched);
    if (report.mismatched > 0) log.error("[economy.reconcile] Có ví xu lệch sổ cái — KHÔNG tự sửa, cần người kiểm tra", { checked, mismatched: report.mismatched });
    try {
      await this.d.store.save(report);
    } catch (err) {
      log.warn("[economy.reconcile] Không lưu được báo cáo", { error: err instanceof Error ? err.message : String(err) });
    }
    return report;
  }
}
