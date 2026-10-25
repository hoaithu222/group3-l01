import { AppError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { newObjectId } from "../../../core/utils/object-id";
import type { CoinTransaction, CoinTransactionInsert } from "../entities/coins.interface";
import { InMemoryCoinLedgerRepository } from "../repositories/ledger.repository.inmemory";
import type { TxHandle } from "../repositories/tx";
import { CoinLedgerService } from "../services/coin-ledger.service";
import { CoinQuestService } from "../services/coin-quest.service";
import { CoinsHarness, xpAwarded } from "./support/coins-harness";

let h: CoinsHarness;
beforeEach(() => {
  h = new CoinsHarness();
});

/** Hoàn thành `n` lần chỉ số tasksDone hôm nay (mỗi lần một sự kiện XP khác nhau). */
async function complete(userId: string, n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) await h.earn.handleXpAwarded(xpAwarded(userId));
}

describe("GET /me/quests — tiến độ hôm nay", () => {
  it("liệt kê nhiệm vụ đang bật theo thứ tự với progress/target/claimable; tiến độ kẹp ở target", async () => {
    const u = h.addUser();
    const a = h.addQuest({ metric: "tasksDone", target: 2, order: 2, title: "B" });
    h.addQuest({ metric: "quizzesTaken", target: 1, order: 1, title: "A" });
    h.addQuest({ metric: "tasksDone", isActive: false });
    await complete(u, 3);
    const list = await h.quests.listMine(u);
    expect(list.map((q) => q.quest.title)).toEqual(["A", "B"]);
    expect(list[0]).toMatchObject({ progress: 0, target: 1, claimable: false, claimedAt: null });
    expect(list[1]).toMatchObject({ progress: 2, target: 2, claimable: true, claimedAt: null });
    expect(list[1]?.quest.id).toBe(a.id);
  });

  it("ngày theo múi giờ người dùng: sang ngày mới thì tiến độ bắt đầu lại từ 0", async () => {
    const u = h.addUser({ timezone: "Asia/Ho_Chi_Minh" });
    h.addQuest({ metric: "tasksDone", target: 1 });
    await complete(u, 1);
    expect((await h.quests.listMine(u))[0]).toMatchObject({ progress: 1, claimable: true });
    h.clockMs += 24 * 3600 * 1000;
    expect((await h.quests.listMine(u))[0]).toMatchObject({ progress: 0, claimable: false });
  });
});

describe("POST /me/quests/:id/claim — nhận thưởng chủ động, đúng một lần", () => {
  it("COIN_005 khi chưa đạt mục tiêu (kèm tiến độ), ví KHÔNG đổi", async () => {
    const u = h.addUser();
    const q = h.addQuest({ metric: "tasksDone", target: 3, coins: 20 });
    await complete(u, 2);
    await expect(h.quests.claim(u, q.id)).rejects.toMatchObject({ code: ErrorCode.COIN_005, statusCode: 400, details: { progress: 2, target: 3 } });
    expect(await h.balanceOf(u)).toBe(0);
    expect(h.store.progress[0]?.claimedAt).toBeNull();
  });

  it("chưa có dòng tiến độ nào (chưa làm gì) → COIN_005 với tiến độ 0", async () => {
    const u = h.addUser();
    const q = h.addQuest({ target: 1 });
    await expect(h.quests.claim(u, q.id)).rejects.toMatchObject({ code: ErrorCode.COIN_005, details: { progress: 0, target: 1 } });
  });

  it("đạt mục tiêu → cộng xu qua sổ cái EARN_QUEST (refId `<questId>:<ngày>`), đặt claimedAt, phát socket QUEST", async () => {
    const u = h.addUser();
    const q = h.addQuest({ metric: "tasksDone", target: 2, coins: 15 });
    await complete(u, 2);
    await expect(h.quests.claim(u, q.id)).resolves.toEqual({ balance: 15, delta: 15 });
    const row = h.store.ledger.find((r) => r.type === "EARN_QUEST");
    expect(row).toMatchObject({ userId: u, amount: 15, refType: "QUEST", refId: `${q.id}:2026-03-10`, balanceAfter: 15 });
    expect(h.store.progress[0]?.claimedAt).toBeInstanceOf(Date);
    expect(h.emitter.events.at(-1)).toEqual({ userId: u, payload: { coins: { balance: 15, delta: 15, reason: "QUEST" } } });
    expect((await h.quests.listMine(u))[0]).toMatchObject({ claimable: false, claimedAt: expect.any(String) as string });
  });

  it("COIN-03: nhận lần hai → COIN_004 (409), số dư chỉ cộng một lần", async () => {
    const u = h.addUser();
    const q = h.addQuest({ metric: "tasksDone", target: 1, coins: 10 });
    await complete(u, 1);
    await h.quests.claim(u, q.id);
    await expect(h.quests.claim(u, q.id)).rejects.toMatchObject({ code: ErrorCode.COIN_004, statusCode: 409 });
    expect(await h.balanceOf(u)).toBe(10);
    expect(h.store.ledger.filter((r) => r.type === "EARN_QUEST")).toHaveLength(1);
  });

  it("10 lần bấm nhận SONG SONG → đúng một lần thành công, còn lại COIN_004", async () => {
    const u = h.addUser();
    const q = h.addQuest({ metric: "tasksDone", target: 1, coins: 10 });
    await complete(u, 1);
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => h.quests.claim(u, q.id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toMatchObject({ code: ErrorCode.COIN_004 });
    expect(await h.balanceOf(u)).toBe(10);
  });

  it("lỗi ở bước sổ cái → HOÀN TÁC cả claimedAt (nhận lại được sau đó, không mất thưởng)", async () => {
    const u = h.addUser();
    const q = h.addQuest({ metric: "tasksDone", target: 1, coins: 10 });
    await complete(u, 1);
    const failing = new (class extends InMemoryCoinLedgerRepository {
      async insert(input: CoinTransactionInsert, tx: TxHandle): Promise<CoinTransaction> {
        if (input.type === "EARN_QUEST") throw new Error("sổ cái lỗi");
        return super.insert(input, tx);
      }
    })(h.store);
    const brokenLedger = new CoinLedgerService({ wallets: h.wallets, ledger: failing, tx: h.tx, config: h.config });
    const broken = new CoinQuestService({ catalog: h.catalog, quests: h.questRepo, progress: h.progress, ledger: brokenLedger, directory: h.directory, tx: h.tx, emitter: h.emitter, now: () => new Date(h.clockMs) });
    await expect(broken.claim(u, q.id)).rejects.toThrow("sổ cái lỗi");
    expect(h.store.progress[0]?.claimedAt).toBeNull();
    expect(await h.balanceOf(u)).toBe(0);
    await expect(h.quests.claim(u, q.id)).resolves.toEqual({ balance: 10, delta: 10 });
  });

  it("nhiệm vụ không tồn tại / đã tắt → 404 (RES_001)", async () => {
    const u = h.addUser();
    const off = h.addQuest({ isActive: false });
    for (const id of [newObjectId(), off.id]) {
      const err = await h.quests.claim(u, id).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AppError);
      expect(err).toMatchObject({ statusCode: 404, code: ErrorCode.RES_001 });
    }
  });

  it("chỉ nhận được thưởng của HÔM NAY: tiến độ hôm qua không nhận được vào ngày mới", async () => {
    const u = h.addUser();
    const q = h.addQuest({ metric: "tasksDone", target: 1 });
    await complete(u, 1);
    h.clockMs += 24 * 3600 * 1000;
    await expect(h.quests.claim(u, q.id)).rejects.toMatchObject({ code: ErrorCode.COIN_005 });
  });

  it("người này hoàn thành không cho phép người kia nhận (tiến độ theo từng người)", async () => {
    const a = h.addUser();
    const b = h.addUser();
    const q = h.addQuest({ metric: "tasksDone", target: 1 });
    await complete(a, 1);
    await expect(h.quests.claim(b, q.id)).rejects.toMatchObject({ code: ErrorCode.COIN_005 });
    await expect(h.quests.claim(a, q.id)).resolves.toMatchObject({ delta: 15 });
  });
});
