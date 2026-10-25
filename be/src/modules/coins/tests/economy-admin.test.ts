import { ErrorCode } from "../../../core/utils/error.codes";
import { newObjectId } from "../../../core/utils/object-id";
import type { CoinWallet } from "../entities/coins.interface";
import { InMemoryCoinWalletRepository } from "../repositories/wallet.repository.inmemory";
import { EconomyReconcileService } from "../services/economy-reconcile.service";
import { adminOf, CoinsHarness, xpAwarded } from "./support/coins-harness";

let h: CoinsHarness;
beforeEach(() => {
  h = new CoinsHarness();
});

const REASON = "Bù xu do lỗi hệ thống ngày 09/03";

describe("POST /admin/economy/users/:userId/adjust — điều chỉnh xu có lý do", () => {
  it("cộng xu: dòng ADJUST_ADMIN mang actorId + lý do, audit `coins.adjust`, phát socket ADJUST", async () => {
    const u = h.addUser();
    const admin = adminOf();
    const res = await h.admin.adjust(admin, u, { amount: 300, reason: REASON }, "adj-key-0001");
    expect(res).toEqual({ balance: 300, delta: 300, replayed: false });
    expect(h.store.ledger[0]).toMatchObject({ userId: u, amount: 300, type: "ADJUST_ADMIN", refType: "ADMIN", refId: "adj-key-0001", note: REASON, actorId: admin.id, balanceAfter: 300 });
    expect(h.audit.records).toEqual([
      expect.objectContaining({ actorId: admin.id, actorRole: "admin", action: "coins.adjust", targetType: "CoinWallet", targetId: u, reason: REASON, metadata: expect.objectContaining({ amount: 300, balanceAfter: 300 }) as unknown }),
    ]);
    expect(h.emitter.events.at(-1)).toEqual({ userId: u, payload: { coins: { balance: 300, delta: 300, reason: "ADJUST" } } });
  });

  it("điều chỉnh KHÔNG tính vào tổng đã nhận/đã tiêu của người dùng", async () => {
    const u = h.addUser();
    await h.admin.adjust(adminOf(), u, { amount: 500, reason: REASON }, "adj-key-0002");
    await h.admin.adjust(adminOf(), u, { amount: -200, reason: REASON }, "adj-key-0003");
    expect(await h.wallets.find(u)).toMatchObject({ balance: 300, lifetimeEarned: 0, lifetimeSpent: 0 });
  });

  it("trừ làm số dư ÂM → COIN_001; ví, sổ cái, audit và socket đều không đổi", async () => {
    const u = h.addUser();
    await h.fund(u, 100);
    const rows = h.store.ledger.length;
    await expect(h.admin.adjust(adminOf(), u, { amount: -101, reason: REASON }, "adj-key-0004")).rejects.toMatchObject({ code: ErrorCode.COIN_001, statusCode: 400 });
    expect(await h.balanceOf(u)).toBe(100);
    expect(h.store.ledger).toHaveLength(rows);
    expect(h.audit.records).toHaveLength(0);
    expect(h.emitter.events).toHaveLength(0);
  });

  it("Idempotency-Key: gửi lại cùng khoá (kể cả bởi admin khác hoặc với số khác) → KHÔNG cộng hai lần, KHÔNG audit lần hai, trả delta của lần đầu", async () => {
    const u = h.addUser();
    const first = await h.admin.adjust(adminOf(), u, { amount: 50, reason: REASON }, "same-key-01");
    const again = await h.admin.adjust(adminOf(), u, { amount: 50, reason: REASON }, "same-key-01");
    const other = await h.admin.adjust(adminOf(), u, { amount: 9999, reason: REASON }, "same-key-01");
    expect([first.replayed, again.replayed, other.replayed]).toEqual([false, true, true]);
    expect(other.delta).toBe(50);
    expect(await h.balanceOf(u)).toBe(50);
    expect(h.audit.records).toHaveLength(1);
  });

  it("10 yêu cầu song song cùng khoá → đúng một dòng ledger", async () => {
    const u = h.addUser();
    const admin = adminOf();
    const results = await Promise.all(Array.from({ length: 10 }, () => h.admin.adjust(admin, u, { amount: 25, reason: REASON }, "par-key-0001")));
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(await h.balanceOf(u)).toBe(25);
    expect(h.audit.records).toHaveLength(1);
  });

  it("vượt trần adjustMax hiệu lực (admin đã HẠ trần) → 400 dù DTO cho qua; dưới trần thì được", async () => {
    const u = h.addUser();
    h.config.limitValues.adjustMax = 1000;
    await expect(h.admin.adjust(adminOf(), u, { amount: 1001, reason: REASON }, "cap-key-0001")).rejects.toMatchObject({ code: ErrorCode.VAL_001, statusCode: 400 });
    await expect(h.admin.adjust(adminOf(), u, { amount: 1000, reason: REASON }, "cap-key-0002")).resolves.toMatchObject({ balance: 1000 });
  });

  it("vượt mức số dư tối đa → COIN_009", async () => {
    const u = h.addUser();
    h.config.limitValues.balanceMax = 500;
    await h.admin.adjust(adminOf(), u, { amount: 400, reason: REASON }, "max-key-0001");
    await expect(h.admin.adjust(adminOf(), u, { amount: 200, reason: REASON }, "max-key-0002")).rejects.toMatchObject({ code: ErrorCode.COIN_009 });
  });

  it("người dùng không tồn tại / đã ẩn danh hoá → 404, không tạo ví", async () => {
    const gone = h.addUser({ status: "ANONYMIZED" });
    for (const id of [newObjectId(), gone]) {
      await expect(h.admin.adjust(adminOf(), id, { amount: 10, reason: REASON }, "nf-key-00001")).rejects.toMatchObject({ statusCode: 404 });
    }
    expect(h.store.wallets.size).toBe(0);
  });
});

describe("xem ví/lịch sử của một người (admin) và của chính mình", () => {
  async function history() {
    const u = h.addUser();
    h.addRule("TASK_COMPLETED", { coins: 2 });
    for (let i = 0; i < 3; i += 1) await h.earn.handleXpAwarded(xpAwarded(u));
    await h.admin.adjust(adminOf(), u, { amount: 40, reason: REASON }, "hist-key-001");
    return u;
  }

  it("phân trang cursor mới → cũ, hasMore/nextCursor đúng, không trùng/không sót giữa các trang", async () => {
    const u = await history();
    const p1 = await h.walletQuery.transactions(u, { limit: 3 });
    expect(p1.data.map((t) => t.type)).toEqual(["ADJUST_ADMIN", "EARN_EVENT", "EARN_EVENT"]);
    expect(p1.meta).toMatchObject({ hasMore: true, limit: 3, nextCursor: expect.any(String) as string });
    const p2 = await h.walletQuery.transactions(u, { limit: 3, cursor: p1.meta.nextCursor ?? undefined });
    expect(p2.data).toHaveLength(1);
    expect(p2.meta).toEqual({ hasMore: false, nextCursor: null, limit: 3 });
    const ids = [...p1.data, ...p2.data].map((t) => t.id);
    expect(new Set(ids).size).toBe(4);
  });

  it("lọc theo loại; DTO người dùng KHÔNG có note/actorId/counterpartyId, DTO admin có", async () => {
    const u = await history();
    const mine = await h.walletQuery.transactions(u, { limit: 10, type: "ADJUST_ADMIN" });
    expect(mine.data).toHaveLength(1);
    expect(Object.keys(mine.data[0] ?? {}).sort()).toEqual(["amount", "at", "balanceAfter", "id", "refId", "refType", "type"]);
    const admin = await h.admin.userTransactions(u, { limit: 10, type: "ADJUST_ADMIN" });
    expect(admin.data[0]).toMatchObject({ note: REASON, actorId: expect.any(String) as string });
  });

  it("GET /me/wallet: số dư, tổng nhận/tiêu, đã nhận hôm nay theo trần ngày; người chưa có ví → số 0", async () => {
    const u = await history();
    expect(await h.walletQuery.summary(u)).toEqual({ balance: 46, lifetimeEarned: 6, lifetimeSpent: 0, todayEarned: 6, dailyCap: 200 });
    const fresh = h.addUser();
    expect(await h.walletQuery.summary(fresh)).toEqual({ balance: 0, lifetimeEarned: 0, lifetimeSpent: 0, todayEarned: 0, dailyCap: 200 });
    expect(h.store.wallets.has(fresh)).toBe(false);
  });

  it("admin xem ví/lịch sử người không tồn tại → 404", async () => {
    await expect(h.admin.userWallet(newObjectId())).rejects.toMatchObject({ statusCode: 404 });
    await expect(h.admin.userTransactions(newObjectId(), { limit: 5 })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("tổng quan kinh tế xu", () => {
  it("tổng phát hành/tiêu/đốt/điều chỉnh theo ngày + số xu lưu hành + top vật phẩm", async () => {
    const u = h.addUser();
    h.addRule("TASK_COMPLETED", { coins: 10 });
    const item = h.addItem({ price: 15 });
    await h.earn.handleXpAwarded(xpAwarded(u));
    await h.earn.handleXpAwarded(xpAwarded(u));
    await h.shop.buy(u, item.id);
    await h.admin.adjust(adminOf(), u, { amount: -2, reason: REASON }, "ov-key-000001");
    // Dòng sổ cái dùng đồng hồ giả của store (2026-01-01) — đưa đồng hồ của dịch vụ về đúng ngày đó để "hôm nay" trùng.
    h.clockMs = Date.UTC(2026, 0, 1, 5, 0, 0);
    const ov = await h.admin.overview(3);
    expect(ov.totals).toEqual({ issued: 20, spent: 15, burned: 0, adjusted: -2 });
    expect(ov.perDay).toHaveLength(3);
    expect(ov.perDay.at(-1)).toMatchObject({ date: "2026-01-01", issued: 20, spent: 15, adjusted: -2 });
    expect(ov.perDay[0]).toMatchObject({ date: "2025-12-30", issued: 0 });
    expect(ov.circulating).toBe(3);
    expect(ov.topItems).toEqual([{ itemId: item.id, code: item.code, name: item.name, owners: 1 }]);
    expect(ov.reconcile).toBeNull();
  });
});

describe("đối soát ví ↔ sổ cái (COIN-04)", () => {
  async function seeded() {
    const users = [h.addUser(), h.addUser(), h.addUser()];
    for (const u of users) await h.fund(u, 100);
    return users;
  }

  it("khớp → mismatched 0, gauge 0, báo cáo lưu lại", async () => {
    await seeded();
    const report = await h.reconcile.run();
    expect(report).toMatchObject({ checked: 3, mismatched: 0, sampleUserIds: [] });
    expect(h.metrics.mismatch).toBe(0);
    expect(h.reconcileStore.report).toEqual(report);
  });

  it("sửa TAY balance lệch sổ cái → phát hiện, gauge > 0, báo cáo nêu id; KHÔNG tự sửa (balance và sổ cái giữ nguyên)", async () => {
    const [a, b] = await seeded();
    const w = h.store.wallets.get(a ?? "");
    if (w) w.balance += 7;
    const ledgerBefore = JSON.stringify(h.store.ledger);
    const report = await h.reconcile.run();
    expect(report).toMatchObject({ checked: 3, mismatched: 1, sampleUserIds: [a] });
    expect(h.metrics.mismatch).toBe(1);
    expect(await h.balanceOf(a ?? "")).toBe(107);
    expect(await h.balanceOf(b ?? "")).toBe(100);
    expect(JSON.stringify(h.store.ledger)).toBe(ledgerBefore);
    expect((await h.admin.overview(1)).reconcile).toMatchObject({ mismatched: 1 });
  });

  it("lệch GIẢ do giao dịch commit giữa lúc đọc trang ví và lúc cộng sổ cái → bước kiểm lại loại bỏ", async () => {
    await seeded();
    // Trang ví trả số dư cũ (trước một giao dịch vừa commit) nhưng ví thật/sổ cái đã khớp.
    const stale = new (class extends InMemoryCoinWalletRepository {
      async listPage(opts: { afterUserId?: string; limit: number }): Promise<CoinWallet[]> {
        return (await super.listPage(opts)).map((w) => ({ ...w, balance: w.balance - 1 }));
      }
    })(h.store);
    const svc = new EconomyReconcileService({ wallets: stale, ledger: h.ledgerRepo, metrics: h.metrics, store: h.reconcileStore });
    await expect(svc.run()).resolves.toMatchObject({ checked: 3, mismatched: 0 });
  });

  it("nhiều trang ví (vượt cỡ lô) đều được quét đủ và phát hiện lệch ở trang sau", async () => {
    const users = [];
    for (let i = 0; i < 5; i += 1) {
      const u = h.addUser();
      await h.fund(u, 10);
      users.push(u);
    }
    const last = h.store.wallets.get([...users].sort().at(-1) ?? "");
    if (last) last.balance += 1;
    const svc = new EconomyReconcileService({ wallets: h.wallets, ledger: h.ledgerRepo, metrics: h.metrics, store: h.reconcileStore, batchSize: 2 });
    await expect(svc.run()).resolves.toMatchObject({ checked: 5, mismatched: 1 });
  });
});
