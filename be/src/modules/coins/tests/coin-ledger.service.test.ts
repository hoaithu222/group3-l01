import { AppError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { newObjectId } from "../../../core/utils/object-id";
import type { CoinTransaction, CoinTransactionInsert } from "../entities/coins.interface";
import { InMemoryCoinLedgerRepository } from "../repositories/ledger.repository.inmemory";
import { ParallelTxRunner } from "../repositories/tx.inmemory";
import type { TxHandle } from "../repositories/tx";
import { CoinLedgerService } from "../services/coin-ledger.service";
import { CoinsHarness } from "./support/coins-harness";

let h: CoinsHarness;
beforeEach(() => {
  h = new CoinsHarness();
});

const key = (n: string) => ({ refType: "ADMIN" as const, refId: n });

/** Bắt lỗi nghiệp vụ (AppError) để kiểm mã + details. */
async function appError(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error("Đáng lẽ phải ném AppError");
}

describe("post/credit/debit — thay đổi số dư nguyên tử có sổ cái", () => {
  it("nhận xu: dòng sổ cái có balanceAfter đúng, ví cộng số dư + tổng đã nhận", async () => {
    const u = h.addUser();
    const res = await h.ledger.postAtomic({ userId: u, amount: 30, type: "EARN_EVENT", refType: "XP_EVENT", refId: "TASK_COMPLETED:t1" });
    expect(res).toMatchObject({ balance: 30, replayed: false, entry: { amount: 30, balanceAfter: 30, type: "EARN_EVENT", refType: "XP_EVENT", userId: u } });
    const res2 = await h.ledger.postAtomic({ userId: u, amount: 12, type: "EARN_EVENT", refType: "XP_EVENT", refId: "TASK_COMPLETED:t2" });
    expect(res2.entry.balanceAfter).toBe(42);
    expect(await h.wallets.find(u)).toMatchObject({ balance: 42, lifetimeEarned: 42, lifetimeSpent: 0, version: 3 });
  });

  it("GM-06: thiếu xu → COIN_001 (400) kèm số dư/số cần, ví và sổ cái KHÔNG đổi", async () => {
    const u = h.addUser();
    await h.fund(u, 50);
    const before = h.store.ledger.length;
    const err = await appError(h.ledger.postAtomic({ userId: u, amount: -80, type: "SPEND_SHOP", refType: "SHOP_ITEM", refId: "item1" }));
    expect(err).toMatchObject({ code: ErrorCode.COIN_001, statusCode: 400, details: { balance: 50, required: 80 } });
    expect(await h.balanceOf(u)).toBe(50);
    expect(h.store.ledger).toHaveLength(before);
  });

  it("số dư KHÔNG BAO GIỜ âm: tiêu đúng bằng số dư về 0 được, thêm 1 xu bị từ chối", async () => {
    const u = h.addUser();
    await h.fund(u, 100);
    await h.ledger.postAtomic({ userId: u, amount: -100, type: "SPEND_SHOP", refType: "SHOP_ITEM", refId: "a" });
    expect(await h.balanceOf(u)).toBe(0);
    await expect(h.ledger.postAtomic({ userId: u, amount: -1, type: "SPEND_SHOP", refType: "SHOP_ITEM", refId: "b" })).rejects.toMatchObject({ code: ErrorCode.COIN_001 });
    expect(await h.balanceOf(u)).toBe(0);
  });

  it("người chưa từng có ví bị trừ xu → COIN_001 với số dư 0 (ví được tạo lười, không âm)", async () => {
    const u = h.addUser();
    await expect(h.ledger.postAtomic({ userId: u, amount: -5, type: "SPEND_SHOP", refType: "SHOP_ITEM", refId: "x" })).rejects.toMatchObject({ code: ErrorCode.COIN_001, details: { balance: 0, required: 5 } });
  });

  it("vượt trần số dư → COIN_009, ví không đổi", async () => {
    const u = h.addUser();
    h.config.limitValues.balanceMax = 100;
    await h.fund(u, 90);
    const err = await appError(h.ledger.postAtomic({ userId: u, amount: 11, type: "ADJUST_ADMIN", refType: "ADMIN", refId: "k" }));
    expect(err).toMatchObject({ code: ErrorCode.COIN_009, details: { max: 100 } });
    expect(await h.balanceOf(u)).toBe(90);
    await expect(h.ledger.postAtomic({ userId: u, amount: 10, type: "ADJUST_ADMIN", refType: "ADMIN", refId: "k2" })).resolves.toMatchObject({ balance: 100 });
  });

  it("sai dấu theo loại / số 0 / số thực → lỗi lập trình, KHÔNG ghi gì", async () => {
    const u = h.addUser();
    for (const [type, amount] of [["EARN_EVENT", -5], ["SPEND_SHOP", 5], ["EARN_EVENT", 0], ["EARN_QUEST", 1.5]] as const) {
      await expect(h.ledger.postAtomic({ userId: u, amount, type, refType: "XP_EVENT", refId: "z" })).rejects.toThrow(/không hợp lệ/);
    }
    expect(h.store.ledger).toHaveLength(0);
  });

  it("credit/debit nhận ĐỘ LỚN dương và tự đặt dấu; debit với loại EARN bị từ chối", async () => {
    const u = h.addUser();
    await h.ledger.ensureWallets([u]);
    const c = await h.tx.run((tx) => h.ledger.credit(tx, { userId: u, amount: 40, type: "EARN_QUEST", refType: "QUEST", refId: "q:1" }));
    expect(c.entry.amount).toBe(40);
    const d = await h.tx.run((tx) => h.ledger.debit(tx, { userId: u, amount: 15, type: "SPEND_SHOP", refType: "SHOP_ITEM", refId: "i" }));
    expect(d.entry).toMatchObject({ amount: -15, balanceAfter: 25 });
    await expect(h.tx.run((tx) => h.ledger.debit(tx, { userId: u, amount: 1, type: "EARN_EVENT", refType: "XP_EVENT", refId: "w" }))).rejects.toThrow(/không hợp lệ/);
  });
});

describe("idempotency — chống cộng/trừ hai lần (COIN-01)", () => {
  it("gọi lại cùng khoá (type, refType, refId, userId): một dòng, replayed=true, số dư đổi ĐÚNG MỘT LẦN", async () => {
    const u = h.addUser();
    const input = { userId: u, amount: 25, type: "EARN_QUEST" as const, ...{ refType: "QUEST" as const, refId: "q1:2026-03-10" } };
    const first = await h.ledger.postAtomic(input);
    const second = await h.ledger.postAtomic(input);
    const third = await h.ledger.postAtomic(input);
    expect([first.replayed, second.replayed, third.replayed]).toEqual([false, true, true]);
    expect(second.entry.id).toBe(first.entry.id);
    expect(await h.balanceOf(u)).toBe(25);
    expect(h.store.ledger).toHaveLength(1);
  });

  it("20 yêu cầu SONG SONG cùng khoá → đúng một dòng, số dư đổi một lần", async () => {
    const u = h.addUser();
    const input = { userId: u, amount: -10, type: "SPEND_SHOP" as const, refType: "SHOP_ITEM" as const, refId: "item-1" };
    await h.fund(u, 100);
    const results = await Promise.all(Array.from({ length: 20 }, () => h.ledger.postAtomic(input)));
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(await h.balanceOf(u)).toBe(90);
    expect(h.store.ledger.filter((r) => r.type === "SPEND_SHOP")).toHaveLength(1);
  });

  it("khác refId, khác type hoặc khác người = giao dịch KHÁC (không bị coi là trùng)", async () => {
    const a = h.addUser();
    const b = h.addUser();
    await h.ledger.postAtomic({ userId: a, amount: 5, type: "ADJUST_ADMIN", ...key("k") });
    const sameRefOtherUser = await h.ledger.postAtomic({ userId: b, amount: 5, type: "ADJUST_ADMIN", ...key("k") });
    const otherRef = await h.ledger.postAtomic({ userId: a, amount: 5, type: "ADJUST_ADMIN", ...key("k2") });
    const otherType = await h.ledger.postAtomic({ userId: a, amount: 5, type: "EARN_QUEST", refType: "ADMIN", refId: "k" });
    expect([sameRefOtherUser.replayed, otherRef.replayed, otherType.replayed]).toEqual([false, false, false]);
    expect(await h.balanceOf(a)).toBe(15);
  });

  it("đua unique ở tầng repository (hai giao dịch cùng qua bước kiểm) → UniqueViolationError làm hỏng transaction ⇒ HOÀN TÁC ví, rồi trả dòng cũ", async () => {
    const u = h.addUser();
    // Mô phỏng đua: `findByKey` trong transaction luôn "không thấy" (lượt kia chưa commit khi ta kiểm), nhưng lúc insert unique đã có dòng.
    await h.ledger.postAtomic({ userId: u, amount: 20, type: "ADJUST_ADMIN", ...key("race") });
    const blind = new (class extends InMemoryCoinLedgerRepository {
      private calls = 0;
      async findByKey(k: Parameters<InMemoryCoinLedgerRepository["findByKey"]>[0], t?: TxHandle): Promise<CoinTransaction | null> {
        this.calls += 1;
        return this.calls === 1 ? null : super.findByKey(k, t);
      }
    })(h.store);
    const racing = new CoinLedgerService({ wallets: h.wallets, ledger: blind, tx: h.tx, config: h.config });
    const res = await racing.postAtomic({ userId: u, amount: 20, type: "ADJUST_ADMIN", ...key("race") });
    expect(res.replayed).toBe(true);
    expect(await h.balanceOf(u)).toBe(20);
    expect(h.store.ledger).toHaveLength(1);
  });
});

describe("điều kiện CAS khi các lời gọi XEN KẼ thật sự (không tuần tự hoá, mọi bước repo nhường luồng)", () => {
  const parallel = () => new CoinLedgerService({ wallets: h.wallets, ledger: h.ledgerRepo, tx: new ParallelTxRunner(), config: h.config });

  it("số dư chỉ đủ 1 lần mua, 20 yêu cầu KHÁC refId → đúng 1 thành công, 19 COIN_001, số dư 0", async () => {
    const u = h.addUser();
    await h.fund(u, 100);
    const svc = parallel();
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => svc.postAtomic({ userId: u, amount: -100, type: "SPEND_SHOP", refType: "SHOP_ITEM", refId: `item-${String(i)}` })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(failures).toHaveLength(19);
    for (const f of failures) expect(f.reason).toMatchObject({ code: ErrorCode.COIN_001 });
    expect(await h.balanceOf(u)).toBe(0);
    expect(h.store.ledger.filter((r) => r.type === "SPEND_SHOP")).toHaveLength(1);
  });

  it("số dư 100, 20 lần trừ 30 song song → đúng 3 thành công, số dư còn 10 và KHÔNG âm ở bất kỳ thời điểm nào", async () => {
    const u = h.addUser();
    await h.fund(u, 100);
    const svc = parallel();
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => svc.postAtomic({ userId: u, amount: -30, type: "SPEND_SHOP", refType: "SHOP_ITEM", refId: `p-${String(i)}` })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await h.balanceOf(u)).toBe(10);
    expect(h.store.ledger.every((r) => r.balanceAfter >= 0)).toBe(true);
  });

  it("10 lần cộng 1 xu song song: không mất lần cộng nào; balanceAfter của các dòng là {1..10} không trùng", async () => {
    const u = h.addUser();
    const svc = parallel();
    await Promise.all(Array.from({ length: 10 }, (_, i) => svc.postAtomic({ userId: u, amount: 1, type: "EARN_EVENT", refType: "XP_EVENT", refId: `e-${String(i)}` })));
    expect(await h.balanceOf(u)).toBe(10);
    expect(h.store.ledger.map((r) => r.balanceAfter).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe("transfer — chuyển xu kèm phí đốt trong MỘT transaction", () => {
  const fee = (price: number, percent: number) => Math.floor((price * percent) / 100);

  it("người trả −giá, người nhận +giá rồi −phí (BURN_FEE); phí 10% của 15 xu làm tròn xuống = 1; Σ sổ cái mỗi người = số dư", async () => {
    const buyer = h.addUser();
    const seller = h.addUser();
    await h.fund(buyer, 100);
    await h.ledger.ensureWallets([seller]);
    const res = await h.tx.run((tx) => h.ledger.transfer(tx, { fromUserId: buyer, toUserId: seller, amount: 15, fee: fee(15, 10), refType: "PURCHASE", refId: "p1" }));
    expect(res.from.entry).toMatchObject({ amount: -15, type: "SPEND_MARKETPLACE", balanceAfter: 85, counterpartyId: seller });
    expect(res.to.entry).toMatchObject({ amount: 15, type: "EARN_SALE", balanceAfter: 15, counterpartyId: buyer });
    expect(res.burn?.entry).toMatchObject({ amount: -1, type: "BURN_FEE", balanceAfter: 14 });
    expect(await h.balanceOf(buyer)).toBe(85);
    expect(await h.balanceOf(seller)).toBe(14);
    const sums = await h.ledgerRepo.sumByUsers([buyer, seller]);
    expect([sums.get(buyer), sums.get(seller)]).toEqual([85, 14]);
  });

  it("phí 0 → không có dòng BURN_FEE", async () => {
    const a = h.addUser();
    const b = h.addUser();
    await h.fund(a, 10);
    await h.ledger.ensureWallets([b]);
    const res = await h.tx.run((tx) => h.ledger.transfer(tx, { fromUserId: a, toUserId: b, amount: 10, fee: 0, refType: "PURCHASE", refId: "p2" }));
    expect(res.burn).toBeNull();
    expect(h.store.ledger.filter((r) => r.type === "BURN_FEE")).toHaveLength(0);
  });

  it("GM-07: lỗi giữa chừng SAU KHI đã trừ người trả → HOÀN TÁC cả hai ví và sổ cái", async () => {
    const buyer = h.addUser();
    const seller = h.addUser();
    await h.fund(buyer, 100);
    await h.ledger.ensureWallets([seller]);
    const ledgerRowsBefore = h.store.ledger.length;
    // Sổ cái hỏng ở dòng của người NHẬN (dòng thứ hai của lần chuyển) — người trả đã bị trừ và đã có dòng của mình lúc đó.
    const failing = new (class extends InMemoryCoinLedgerRepository {
      async insert(input: CoinTransactionInsert, tx: TxHandle): Promise<CoinTransaction> {
        if (input.type === "EARN_SALE") throw new Error("sổ cái hỏng giữa chừng");
        return super.insert(input, tx);
      }
    })(h.store);
    const svc = new CoinLedgerService({ wallets: h.wallets, ledger: failing, tx: h.tx, config: h.config });
    await expect(h.tx.run((tx) => svc.transfer(tx, { fromUserId: buyer, toUserId: seller, amount: 40, fee: 4, refType: "PURCHASE", refId: "p3" }))).rejects.toThrow("sổ cái hỏng giữa chừng");
    expect(await h.balanceOf(buyer)).toBe(100);
    expect(await h.balanceOf(seller)).toBe(0);
    expect(h.store.ledger).toHaveLength(ledgerRowsBefore);
    expect(await h.wallets.find(buyer)).toMatchObject({ lifetimeSpent: 0 });
  });

  it("GM-07 (biến thể): ném lỗi ngay sau khi transfer xong nhưng trước commit → rollback toàn bộ (crash trước commit)", async () => {
    const a = h.addUser();
    const b = h.addUser();
    await h.fund(a, 60);
    await h.ledger.ensureWallets([b]);
    h.tx.failAfterRun = 1;
    await expect(h.tx.run((tx) => h.ledger.transfer(tx, { fromUserId: a, toUserId: b, amount: 60, fee: 6, refType: "PURCHASE", refId: "p4" }))).rejects.toThrow("crash trước commit");
    expect([await h.balanceOf(a), await h.balanceOf(b)]).toEqual([60, 0]);
  });

  it("người trả thiếu xu → COIN_001 và KHÔNG có dòng nào (kể cả của người nhận)", async () => {
    const a = h.addUser();
    const b = h.addUser();
    await h.fund(a, 5);
    await h.ledger.ensureWallets([b]);
    const rows = h.store.ledger.length;
    await expect(h.tx.run((tx) => h.ledger.transfer(tx, { fromUserId: a, toUserId: b, amount: 10, fee: 1, refType: "PURCHASE", refId: "p5" }))).rejects.toMatchObject({ code: ErrorCode.COIN_001 });
    expect(h.store.ledger).toHaveLength(rows);
    expect(await h.balanceOf(b)).toBe(0);
  });

  it("tham số sai: chuyển cho chính mình, số ≤ 0, phí âm hoặc lớn hơn số chuyển → lỗi lập trình", async () => {
    const a = h.addUser();
    const b = h.addUser();
    const base = { fromUserId: a, toUserId: b, amount: 10, fee: 1, refType: "PURCHASE" as const, refId: "p6" };
    await expect(h.tx.run((tx) => h.ledger.transfer(tx, { ...base, toUserId: a }))).rejects.toThrow(/chính mình/);
    await expect(h.tx.run((tx) => h.ledger.transfer(tx, { ...base, amount: 0 }))).rejects.toThrow(/không hợp lệ/);
    await expect(h.tx.run((tx) => h.ledger.transfer(tx, { ...base, fee: -1 }))).rejects.toThrow(/Phí không hợp lệ/);
    await expect(h.tx.run((tx) => h.ledger.transfer(tx, { ...base, fee: 11 }))).rejects.toThrow(/Phí không hợp lệ/);
  });
});

describe("InMemoryTxRunner — chính bộ giả phải đáng tin", () => {
  it("giao dịch lỗi hoàn tác; giao dịch thành công vẫn thấy dữ liệu; đếm commit đúng", async () => {
    const u = h.addUser();
    await h.fund(u, 10);
    const committedBefore = h.tx.committed;
    await expect(
      h.tx.run(async (tx) => {
        await h.ledger.credit(tx, { userId: u, amount: 5, type: "EARN_EVENT", refType: "XP_EVENT", refId: "a" });
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(await h.balanceOf(u)).toBe(10);
    await h.ledger.postAtomic({ userId: u, amount: 5, type: "EARN_EVENT", refType: "XP_EVENT", refId: "b" });
    expect(await h.balanceOf(u)).toBe(15);
    expect(h.tx.committed).toBe(committedBefore + 1);
  });

  it("newObjectId hợp lệ dùng làm userId (24 hex)", () => {
    expect(newObjectId()).toMatch(/^[0-9a-f]{24}$/);
  });
});
