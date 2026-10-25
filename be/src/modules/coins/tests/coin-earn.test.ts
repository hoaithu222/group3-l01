import { newObjectId } from "../../../core/utils/object-id";
import { CoinsHarness, xpAwarded } from "./support/coins-harness";

let h: CoinsHarness;
beforeEach(() => {
  h = new CoinsHarness();
});

const earnedRows = () => h.store.ledger.filter((r) => r.type === "EARN_EVENT");
const at = (iso: string) => new Date(iso).toISOString();

describe("thưởng xu theo xp.awarded — idempotent theo sự kiện XP (COIN-02)", () => {
  it("nhận sự kiện → thưởng đúng số xu của luật, dòng sổ cái EARN_EVENT refId `<sourceType>:<sourceId>`, phát socket coins", async () => {
    const u = h.addUser();
    h.addRule("TASK_COMPLETED", { coins: 7 });
    const ev = xpAwarded(u, { sourceId: "task1" });
    await expect(h.earn.handleXpAwarded(ev)).resolves.toEqual({ outcome: "GRANTED", coins: 7 });
    expect(earnedRows()).toHaveLength(1);
    expect(earnedRows()[0]).toMatchObject({ userId: u, amount: 7, refType: "XP_EVENT", refId: "TASK_COMPLETED:task1", balanceAfter: 7 });
    expect(h.emitter.events).toEqual([{ userId: u, payload: { coins: { balance: 7, delta: 7, reason: "EARN_EVENT" } } }]);
  });

  it("COIN-02: sự kiện bị giao lại 3 lần (retry) → MỘT dòng ledger, số dư đổi một lần, chỉ lần đầu phát socket", async () => {
    const u = h.addUser();
    h.addRule("TASK_COMPLETED", { coins: 4 });
    const ev = xpAwarded(u);
    const outcomes = [];
    for (let i = 0; i < 3; i += 1) outcomes.push((await h.earn.handleXpAwarded(ev)).outcome);
    expect(outcomes).toEqual(["GRANTED", "DUPLICATE", "DUPLICATE"]);
    expect(earnedRows()).toHaveLength(1);
    expect(await h.balanceOf(u)).toBe(4);
    expect(h.store.earnEvents).toHaveLength(1);
    expect(h.emitter.events).toHaveLength(1);
  });

  it("10 lần giao SONG SONG cùng sự kiện → một dòng ledger, một bản ghi xử lý", async () => {
    const u = h.addUser();
    h.addRule("QUIZ_PASSED", { coins: 6 });
    const ev = xpAwarded(u, { sourceType: "QUIZ_PASSED", sourceId: "att9" });
    const results = await Promise.all(Array.from({ length: 10 }, () => h.earn.handleXpAwarded(ev)));
    expect(results.filter((r) => r.outcome === "GRANTED")).toHaveLength(1);
    expect(earnedRows()).toHaveLength(1);
    expect(await h.balanceOf(u)).toBe(6);
  });

  it("tiến trình chết TRƯỚC commit → hoàn tác sạch (không dòng ledger/bản ghi xử lý/tiến độ), lần giao lại thưởng đúng một lần", async () => {
    const u = h.addUser();
    h.addRule("TASK_COMPLETED", { coins: 5 });
    const quest = h.addQuest({ metric: "tasksDone", target: 3 });
    const ev = xpAwarded(u);
    h.tx.failAfterRun = 1;
    await expect(h.earn.handleXpAwarded(ev)).rejects.toThrow("crash trước commit");
    expect(h.store.ledger).toHaveLength(0);
    expect(h.store.earnEvents).toHaveLength(0);
    expect(h.store.progress.find((p) => p.questId === quest.id)?.progress).toBe(0);
    await expect(h.earn.handleXpAwarded(ev)).resolves.toMatchObject({ outcome: "GRANTED", coins: 5 });
    expect(await h.balanceOf(u)).toBe(5);
    expect(h.store.progress.find((p) => p.questId === quest.id)?.progress).toBe(1);
  });

  it("nhiều sự kiện KHÁC nhau cộng dồn, balanceAfter tăng dần", async () => {
    const u = h.addUser();
    h.addRule("TASK_COMPLETED", { coins: 3 });
    for (let i = 0; i < 4; i += 1) await h.earn.handleXpAwarded(xpAwarded(u));
    expect(earnedRows().map((r) => r.balanceAfter)).toEqual([3, 6, 9, 12]);
  });
});

describe("chỉ thưởng khi có luật hợp lệ; chống lạm dụng nguồn", () => {
  it("chưa có luật / luật tắt → SKIPPED: không tạo ví, không dòng ledger, đếm metric NO_RULE", async () => {
    const u = h.addUser();
    await expect(h.earn.handleXpAwarded(xpAwarded(u))).resolves.toEqual({ outcome: "SKIPPED", coins: 0 });
    h.addRule("TASK_COMPLETED", { isActive: false });
    await expect(h.earn.handleXpAwarded(xpAwarded(u))).resolves.toEqual({ outcome: "SKIPPED", coins: 0 });
    expect(h.store.wallets.size).toBe(0);
    expect(h.store.ledger).toHaveLength(0);
    expect(h.metrics.skipped).toEqual(["NO_RULE", "NO_RULE"]);
  });

  it("ADMIN_ADJUST (admin cộng XP tay) KHÔNG đẻ ra xu — kể cả khi ai đó lỡ tạo luật cho nguồn này", async () => {
    const u = h.addUser();
    h.store.rules.set("ADMIN_ADJUST", { id: newObjectId(), sourceType: "ADMIN_ADJUST" as never, coins: 999, dailyCap: null, isActive: true, version: 1, updatedBy: null, updatedAt: new Date() });
    h.catalog.invalidate();
    await expect(h.earn.handleXpAwarded(xpAwarded(u, { sourceType: "ADMIN_ADJUST", sourceId: "adj-key", xp: 1000 }))).resolves.toEqual({ outcome: "SKIPPED", coins: 0 });
    expect(h.store.ledger).toHaveLength(0);
  });

  it("nguồn lạ / payload hỏng → bỏ qua KHÔNG ném (retry cũng không đổi kết quả)", async () => {
    const u = h.addUser();
    h.addRule("TASK_COMPLETED");
    for (const bad of [null, {}, { ...xpAwarded(u), userId: "khong-phai-objectid" }, { ...xpAwarded(u), xp: 0 }, { ...xpAwarded(u), sourceType: "NGUON_LA" }, { ...xpAwarded(u), at: "hôm qua" }]) {
      await expect(h.earn.handleXpAwarded(bad)).resolves.toEqual({ outcome: "SKIPPED", coins: 0 });
    }
    expect(h.store.ledger).toHaveLength(0);
  });

  it("phân hệ coins đang TẮT → bỏ qua (metric DISABLED), không ghi gì", async () => {
    const u = h.addUser();
    h.addRule("TASK_COMPLETED");
    h.config.isEnabled = false;
    await expect(h.earn.handleXpAwarded(xpAwarded(u))).resolves.toEqual({ outcome: "SKIPPED", coins: 0 });
    expect(h.metrics.skipped).toEqual(["DISABLED"]);
    expect(h.store.earnEvents).toHaveLength(0);
  });

  it("tài khoản đã ẩn danh hoá hoặc không tồn tại → bỏ qua (USER_INACTIVE)", async () => {
    const gone = h.addUser({ status: "ANONYMIZED" });
    h.addRule("TASK_COMPLETED");
    await expect(h.earn.handleXpAwarded(xpAwarded(gone))).resolves.toEqual({ outcome: "SKIPPED", coins: 0 });
    await expect(h.earn.handleXpAwarded(xpAwarded(newObjectId()))).resolves.toEqual({ outcome: "SKIPPED", coins: 0 });
    expect(h.metrics.skipped).toEqual(["USER_INACTIVE", "USER_INACTIVE"]);
    expect(h.store.ledger).toHaveLength(0);
  });
});

describe("trần ngày (theo luật + chung, theo ngày địa phương)", () => {
  it("trần của luật: nhận đủ tới khi còn lẻ thì nhận phần còn lại, sau đó CAPPED 0 (không dòng ledger mới)", async () => {
    const u = h.addUser();
    h.addRule("TASK_COMPLETED", { coins: 5, dailyCap: 12 });
    const out = [];
    for (let i = 0; i < 4; i += 1) out.push(await h.earn.handleXpAwarded(xpAwarded(u)));
    expect(out.map((r) => [r.outcome, r.coins])).toEqual([["GRANTED", 5], ["GRANTED", 5], ["GRANTED", 2], ["CAPPED", 0]]);
    expect(await h.balanceOf(u)).toBe(12);
    expect(earnedRows()).toHaveLength(3);
    expect(h.store.earnEvents.map((e) => e.capped)).toEqual([false, false, true, true]);
    expect(h.metrics.skipped).toContain("CAPPED");
  });

  it("trần CHUNG dailyEarnCap áp cho tổng mọi luật", async () => {
    const u = h.addUser();
    h.config.limitValues.dailyEarnCap = 8;
    h.addRule("TASK_COMPLETED", { coins: 5 });
    h.addRule("QUIZ_PASSED", { coins: 5 });
    const a = await h.earn.handleXpAwarded(xpAwarded(u));
    const b = await h.earn.handleXpAwarded(xpAwarded(u, { sourceType: "QUIZ_PASSED" }));
    const c = await h.earn.handleXpAwarded(xpAwarded(u));
    expect([a.coins, b.coins, c.coins]).toEqual([5, 3, 0]);
    expect(await h.balanceOf(u)).toBe(8);
  });

  it("admin hạ dailyEarnCap về 0 → ngừng nhận xu từ sự kiện ngay (không tắt phân hệ)", async () => {
    const u = h.addUser();
    h.addRule("TASK_COMPLETED", { coins: 5 });
    h.config.limitValues.dailyEarnCap = 0;
    await expect(h.earn.handleXpAwarded(xpAwarded(u))).resolves.toEqual({ outcome: "CAPPED", coins: 0 });
    expect(await h.balanceOf(u)).toBe(0);
  });

  it("trần tính theo NGÀY ĐỊA PHƯƠNG của người dùng: qua nửa đêm giờ VN thì trần làm mới", async () => {
    const u = h.addUser({ timezone: "Asia/Ho_Chi_Minh" });
    h.addRule("TASK_COMPLETED", { coins: 5, dailyCap: 5 });
    // 16:30Z = 23:30 ngày 10 (VN); 16:45Z vẫn ngày 10; 17:10Z = 00:10 ngày 11.
    const r1 = await h.earn.handleXpAwarded(xpAwarded(u, { at: at("2026-03-10T16:30:00Z") }));
    const r2 = await h.earn.handleXpAwarded(xpAwarded(u, { at: at("2026-03-10T16:45:00Z") }));
    const r3 = await h.earn.handleXpAwarded(xpAwarded(u, { at: at("2026-03-10T17:10:00Z") }));
    expect([r1.outcome, r2.outcome, r3.outcome]).toEqual(["GRANTED", "CAPPED", "GRANTED"]);
    expect(h.store.earnEvents.map((e) => e.localDate)).toEqual(["2026-03-10", "2026-03-10", "2026-03-11"]);
  });

  it("cùng khoảnh khắc, hai múi giờ khác nhau → hai ngày địa phương khác nhau (trần độc lập)", async () => {
    const vn = h.addUser({ timezone: "Asia/Ho_Chi_Minh" });
    const utc = h.addUser({ timezone: "UTC" });
    h.addRule("TASK_COMPLETED", { coins: 5, dailyCap: 5 });
    const when = at("2026-03-10T18:00:00Z");
    await h.earn.handleXpAwarded(xpAwarded(vn, { at: when }));
    await h.earn.handleXpAwarded(xpAwarded(utc, { at: when }));
    expect(h.store.earnEvents.find((e) => e.userId === vn)?.localDate).toBe("2026-03-11");
    expect(h.store.earnEvents.find((e) => e.userId === utc)?.localDate).toBe("2026-03-10");
  });

  it("30 sự kiện KHÁC nhau xử lý song song → tổng xu ĐÚNG bằng trần (không vượt) và mỗi sự kiện tính một lần", async () => {
    const u = h.addUser();
    h.addRule("TASK_COMPLETED", { coins: 5, dailyCap: 50 });
    const results = await Promise.all(Array.from({ length: 30 }, () => h.earn.handleXpAwarded(xpAwarded(u))));
    expect(results.reduce((sum, r) => sum + r.coins, 0)).toBe(50);
    expect(await h.balanceOf(u)).toBe(50);
    expect(h.store.earnEvents).toHaveLength(30);
    expect(h.store.earnEvents.reduce((sum, e) => sum + e.coins, 0)).toBe(50);
  });

  it("trần là RIÊNG từng người: người khác không bị ảnh hưởng", async () => {
    const a = h.addUser();
    const b = h.addUser();
    h.addRule("TASK_COMPLETED", { coins: 5, dailyCap: 5 });
    await h.earn.handleXpAwarded(xpAwarded(a));
    await expect(h.earn.handleXpAwarded(xpAwarded(a))).resolves.toMatchObject({ outcome: "CAPPED" });
    await expect(h.earn.handleXpAwarded(xpAwarded(b))).resolves.toMatchObject({ outcome: "GRANTED", coins: 5 });
  });
});

describe("tiến độ nhiệm vụ ngày từ xp.awarded", () => {
  it("tăng tiến độ đúng MỘT lần cho mỗi sự kiện dù bị giao lại; ngày theo múi giờ người dùng", async () => {
    const u = h.addUser();
    const quest = h.addQuest({ metric: "tasksDone", target: 3 });
    const ev = xpAwarded(u, { at: at("2026-03-10T05:00:00Z") });
    await h.earn.handleXpAwarded(ev);
    await h.earn.handleXpAwarded(ev);
    await h.earn.handleXpAwarded(ev);
    const row = h.store.progress.find((p) => p.questId === quest.id);
    expect(row).toMatchObject({ userId: u, date: "2026-03-10", progress: 1, claimedAt: null });
  });

  it("nhiệm vụ không có luật xu: PROGRESS_ONLY — không tạo ví, không dòng ledger", async () => {
    const u = h.addUser();
    h.addQuest({ metric: "tasksDone" });
    await expect(h.earn.handleXpAwarded(xpAwarded(u))).resolves.toEqual({ outcome: "PROGRESS_ONLY", coins: 0 });
    expect(h.store.wallets.size).toBe(0);
    expect(h.store.ledger).toHaveLength(0);
    expect(h.store.earnEvents).toHaveLength(1);
  });

  it("chỉ nhiệm vụ ĐANG BẬT và ĐÚNG chỉ số nhận tiến độ; nhiều nhiệm vụ cùng chỉ số cùng tăng", async () => {
    const u = h.addUser();
    const a = h.addQuest({ metric: "tasksDone" });
    const b = h.addQuest({ metric: "tasksDone", target: 5 });
    const off = h.addQuest({ metric: "tasksDone", isActive: false });
    const other = h.addQuest({ metric: "quizzesTaken" });
    await h.earn.handleXpAwarded(xpAwarded(u));
    const progressOf = (id: string) => h.store.progress.find((p) => p.questId === id)?.progress;
    expect([progressOf(a.id), progressOf(b.id), progressOf(off.id), progressOf(other.id)]).toEqual([1, 1, undefined, undefined]);
  });

  it("sự kiện bị chặn bởi trần ngày VẪN tính tiến độ nhiệm vụ (hoàn thành việc thật)", async () => {
    const u = h.addUser();
    h.addRule("TASK_COMPLETED", { coins: 5, dailyCap: 5 });
    const quest = h.addQuest({ metric: "tasksDone", target: 2 });
    await h.earn.handleXpAwarded(xpAwarded(u));
    await expect(h.earn.handleXpAwarded(xpAwarded(u))).resolves.toMatchObject({ outcome: "CAPPED" });
    expect(h.store.progress.find((p) => p.questId === quest.id)?.progress).toBe(2);
  });
});

describe("bộ nhớ đệm luật", () => {
  it("sửa luật trong DB có hiệu lực sau ≤ 60 s (không hồi tố); `invalidate` có hiệu lực ngay", async () => {
    const u = h.addUser();
    h.addRule("TASK_COMPLETED", { coins: 2 });
    await h.earn.handleXpAwarded(xpAwarded(u));
    const rule = h.store.rules.get("TASK_COMPLETED");
    if (rule) rule.coins = 9; // ghi thẳng, KHÔNG invalidate: đệm vẫn giữ luật cũ
    await h.earn.handleXpAwarded(xpAwarded(u));
    h.clockMs += 61_000;
    await h.earn.handleXpAwarded(xpAwarded(u));
    expect(earnedRows().map((r) => r.amount)).toEqual([2, 2, 9]);
  });
});
