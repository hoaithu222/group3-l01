import { DEFAULT_TIME_ZONE, localDate } from "../../../core/utils/local-date";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import type { CursorResponse } from "../../../core/utils/response";
import type { CoinTransaction, CoinTxTypeValue } from "../entities/coins.interface";
import type { ICoinsDirectory } from "../repositories/directory";
import type { ICoinEarnEventRepository } from "../repositories/earn-event.repository.interface";
import type { ICoinLedgerRepository } from "../repositories/ledger.repository.interface";
import type { ICoinWalletRepository } from "../repositories/wallet.repository.interface";
import type { ICoinsConfig } from "./coins.ports";
import { toAdminCoinTransactionDto, toCoinTransactionDto, type AdminCoinTransactionDto, type CoinTransactionDto, type WalletDto } from "./coins-presenter";

export interface CoinWalletDeps {
  wallets: ICoinWalletRepository;
  ledger: ICoinLedgerRepository;
  earnEvents: ICoinEarnEventRepository;
  directory: ICoinsDirectory;
  config: ICoinsConfig;
  now?: () => Date;
}

export interface TxQuery {
  cursor?: string;
  limit: number;
  type?: CoinTxTypeValue;
}

/** Đọc ví + lịch sử (chỉ ĐỌC — không đường nào ghi `balance` ở đây). Người chưa từng nhận/tiêu xu chưa có ví: trả số 0 (không tạo ví khi đọc). */
export class CoinWalletService {
  private readonly now: () => Date;

  constructor(private readonly d: CoinWalletDeps) {
    this.now = d.now ?? (() => new Date());
  }

  async summary(userId: string): Promise<WalletDto> {
    const [wallet, user, limits] = await Promise.all([this.d.wallets.find(userId), this.d.directory.getUser(userId), this.d.config.limits()]);
    const day = localDate(this.now(), user?.timezone ?? DEFAULT_TIME_ZONE);
    const todayEarned = await this.d.earnEvents.sumCoins(userId, day, null);
    return {
      balance: wallet?.balance ?? 0,
      lifetimeEarned: wallet?.lifetimeEarned ?? 0,
      lifetimeSpent: wallet?.lifetimeSpent ?? 0,
      todayEarned,
      dailyCap: limits.dailyEarnCap,
    };
  }

  /** Lịch sử của CHÍNH người gọi (mới → cũ, cursor `(at, id)`); DTO không có `note`/`actorId`. */
  transactions(userId: string, query: TxQuery): Promise<CursorResponse<CoinTransactionDto>> {
    return this.page(userId, query, toCoinTransactionDto);
  }

  /** Lịch sử của một người cho admin (hỗ trợ) — kèm lý do điều chỉnh + admin thực hiện. */
  adminTransactions(userId: string, query: TxQuery): Promise<CursorResponse<AdminCoinTransactionDto>> {
    return this.page(userId, query, toAdminCoinTransactionDto);
  }

  private async page<T>(userId: string, query: TxQuery, map: (t: CoinTransaction) => T): Promise<CursorResponse<T>> {
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.d.ledger.listByUser(userId, { type: query.type, after: after ?? undefined, limit: query.limit + 1 });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];
    return { data: page.map(map), meta: { nextCursor: hasMore && last ? encodeCursor(last.at, last.id) : null, hasMore, limit: query.limit } };
  }
}
