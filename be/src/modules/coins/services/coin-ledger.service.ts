import { isValidAmount, walletDeltaOf } from "../domain/coin-math";
import type { CoinRefTypeValue, CoinTransaction, CoinTxTypeValue } from "../entities/coins.interface";
import { coinErrors } from "../coins.errors";
import type { ICoinLedgerRepository } from "../repositories/ledger.repository.interface";
import { UniqueViolationError, type ITxRunner, type TxHandle } from "../repositories/tx";
import type { ICoinWalletRepository } from "../repositories/wallet.repository.interface";
import type { ICoinsConfig } from "./coins.ports";

export interface CoinLedgerDeps {
  wallets: ICoinWalletRepository;
  ledger: ICoinLedgerRepository;
  tx: ITxRunner;
  config: ICoinsConfig;
}

/** Một thay đổi số dư. `amount` CÓ DẤU (+ nhận, − tiêu) và phải hợp dấu với `type` (xem `isValidAmount`). */
export interface PostInput {
  userId: string;
  amount: number;
  type: CoinTxTypeValue;
  refType: CoinRefTypeValue;
  refId: string;
  counterpartyId?: string | null;
  note?: string | null;
  actorId?: string | null;
}

/** Cùng dữ liệu nhưng `amount` là ĐỘ LỚN dương — `credit` cộng, `debit` trừ; dấu do hàm quyết định. */
export type MagnitudeInput = Omit<PostInput, "amount"> & { amount: number };

export interface PostResult {
  entry: CoinTransaction;
  /** Số dư HIỆN TẠI của ví sau lần ghi (hoặc hiện tại, khi là phát lại). */
  balance: number;
  /** `true` = dòng cùng khoá đã tồn tại từ trước, KHÔNG ghi gì mới (idempotent). */
  replayed: boolean;
}

export interface TransferInput {
  fromUserId: string;
  toUserId: string;
  /** Tổng người trả bỏ ra (> 0). */
  amount: number;
  /** Phần phí "đốt" lấy từ khoản người nhận được (0..amount); người nhận thực nhận `amount − fee`. */
  fee: number;
  refType: CoinRefTypeValue;
  refId: string;
  note?: string | null;
}

export interface TransferResult {
  from: PostResult;
  to: PostResult;
  burn: PostResult | null;
}

/**
 * SỔ CÁI xu (p7-02 be.md §5) — ĐƯỜNG DUY NHẤT thay đổi `CoinWallet.balance`. Mọi thay đổi = MỘT transaction gồm (a) cập nhật ví CÓ ĐIỀU KIỆN nguyên tử (số dư không âm, không vượt trần) và
 * (b) một dòng `CoinTransaction` APPEND-ONLY có `balanceAfter` đọc trong CÙNG transaction. Khoá idempotent `(type, refType, refId, userId)`: gọi lại cùng khoá không cộng/trừ lần hai —
 * phát hiện bằng `findByKey` trong transaction (đường thường) và bằng unique index khi hai yêu cầu đua nhau (P2002 làm hỏng transaction Mongo ⇒ để lỗi thoát callback, rollback cả cập nhật
 * ví, rồi trả kết quả cũ ở NGOÀI — `postAtomic`).
 *
 * `post/credit/debit/transfer` chạy TRONG transaction của caller (để gộp với việc khác — vd cấp vật phẩm cùng lúc trừ xu) và KHÔNG tự bắt `UniqueViolationError`; caller dùng `postAtomic` hoặc tự
 * bắt ở ngoài `tx.run`. Ví phải tồn tại TRƯỚC (`ensureWallets`, ngoài transaction: hai giao dịch cùng tạo một document ví sẽ va unique và không retry được).
 * ⛔ Không service nào khác được ghi `balance` — cấm import `PrismaCoinWalletRepository.applyDelta` ngoài file này.
 */
export class CoinLedgerService {
  constructor(private readonly d: CoinLedgerDeps) {}

  /** Tạo trước (NGOÀI transaction) ví của mọi người sẽ bị đụng tới. */
  async ensureWallets(userIds: readonly string[]): Promise<void> {
    for (const id of new Set(userIds)) await this.d.wallets.ensure(id);
  }

  async post(tx: TxHandle, input: PostInput): Promise<PostResult> {
    if (!isValidAmount(input.type, input.amount)) throw new Error(`Số xu không hợp lệ cho ${input.type}: ${String(input.amount)}`);
    const key = { type: input.type, refType: input.refType, refId: input.refId, userId: input.userId };
    const existing = await this.d.ledger.findByKey(key, tx);
    if (existing) return { entry: existing, balance: (await this.d.wallets.find(input.userId, tx))?.balance ?? existing.balanceAfter, replayed: true };

    const { balanceMax } = await this.d.config.limits();
    const res = await this.d.wallets.applyDelta(input.userId, walletDeltaOf(input.type, input.amount), balanceMax, tx);
    if (!res.ok) {
      if (res.reason === "MISSING") throw new Error(`CoinWallet chưa có cho ${input.userId} (gọi ensureWallets trước transaction)`);
      if (res.reason === "OVER_LIMIT") throw coinErrors.balanceLimit(balanceMax);
      throw coinErrors.insufficient((await this.d.wallets.find(input.userId, tx))?.balance ?? 0, -input.amount);
    }
    const entry = await this.d.ledger.insert(
      {
        ...key,
        amount: input.amount,
        balanceAfter: res.wallet.balance,
        counterpartyId: input.counterpartyId ?? null,
        note: input.note ?? null,
        actorId: input.actorId ?? null,
      },
      tx
    );
    return { entry, balance: res.wallet.balance, replayed: false };
  }

  credit(tx: TxHandle, input: MagnitudeInput): Promise<PostResult> {
    return this.post(tx, { ...input, amount: Math.abs(input.amount) });
  }

  debit(tx: TxHandle, input: MagnitudeInput): Promise<PostResult> {
    return this.post(tx, { ...input, amount: -Math.abs(input.amount) });
  }

  /**
   * Chuyển xu người → người kèm phí đốt, MỘT transaction của caller: người trả −`amount` (SPEND_MARKETPLACE), người nhận +`amount` (EARN_SALE) rồi −`fee` (BURN_FEE) — cả hai dòng của người
   * nhận cùng nằm trên sổ của họ nên Σ sổ cái mỗi người vẫn bằng số dư và tổng "đã đốt" đo được bằng loại BURN_FEE. Lỗi ở BẤT KỲ bước nào (kể cả sau khi đã trừ người trả) → caller rollback CẢ HAI ví.
   * P0 chưa có endpoint nào gọi hàm này (chợ tài liệu là P1); giữ ở đây để mọi đường chuyển xu sau này dùng chung MỘT cài đặt đã kiểm thử.
   */
  async transfer(tx: TxHandle, input: TransferInput): Promise<TransferResult> {
    if (input.fromUserId === input.toUserId) throw new Error("Không chuyển xu cho chính mình");
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error(`Số xu chuyển không hợp lệ: ${String(input.amount)}`);
    if (!Number.isSafeInteger(input.fee) || input.fee < 0 || input.fee > input.amount) throw new Error(`Phí không hợp lệ: ${String(input.fee)}`);
    const base = { refType: input.refType, refId: input.refId, note: input.note ?? null };
    const from = await this.debit(tx, { ...base, userId: input.fromUserId, amount: input.amount, type: "SPEND_MARKETPLACE", counterpartyId: input.toUserId });
    const to = await this.credit(tx, { ...base, userId: input.toUserId, amount: input.amount, type: "EARN_SALE", counterpartyId: input.fromUserId });
    const burn = input.fee > 0 ? await this.debit(tx, { ...base, userId: input.toUserId, amount: input.fee, type: "BURN_FEE", counterpartyId: null }) : null;
    return { from, to, burn };
  }

  /** Một thay đổi độc lập, tự mở transaction; gọi lại cùng khoá (kể cả hai yêu cầu song song) trả dòng cũ với `replayed: true`. */
  async postAtomic(input: PostInput): Promise<PostResult> {
    await this.ensureWallets([input.userId]);
    try {
      return await this.d.tx.run((tx) => this.post(tx, input));
    } catch (err) {
      if (err instanceof UniqueViolationError) return this.replayOf(input);
      throw err;
    }
  }

  /** Dòng đã có của khoá này (sau khi bắt `UniqueViolationError` ở NGOÀI transaction) — `null` nếu không tìm thấy (đua hiếm với xoá tay: caller ném lại lỗi gốc). */
  async findExisting(input: Pick<PostInput, "type" | "refType" | "refId" | "userId">): Promise<PostResult | null> {
    const entry = await this.d.ledger.findByKey({ type: input.type, refType: input.refType, refId: input.refId, userId: input.userId });
    if (!entry) return null;
    return { entry, balance: (await this.d.wallets.find(input.userId))?.balance ?? entry.balanceAfter, replayed: true };
  }

  private async replayOf(input: PostInput): Promise<PostResult> {
    const found = await this.findExisting(input);
    if (!found) throw new UniqueViolationError("CoinTransaction");
    return found;
  }
}
