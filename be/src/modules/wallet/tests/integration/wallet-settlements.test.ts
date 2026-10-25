import { installMocks, redisStore } from "./wallet-test-mocks";
import { buildWalletApp, cleanupGroups, expenseBody, makeApi, seedGroup, tokenFor, type Group } from "./wallet-test-kit";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";

const app = buildWalletApp();
const api = makeApi(app);

describe("wallet — settlement & gợi ý thanh toán (integration)", () => {
  const groups: Group[] = [];
  const setup = async (spec: Parameters<typeof seedGroup>[0]) => {
    const g = await seedGroup(spec);
    groups.push(g);
    return g;
  };
  beforeEach(() => installMocks());
  afterEach(async () => {
    await cleanupGroups(groups.splice(0));
    redisStore.clear();
  });

  const summaryOf = async (g: Group, who: string) =>
    (await api("get", `/workspaces/${g.workspaceId}/wallet/summary`, tokenFor(g.ids[who]))).body.data;
  const pay = (g: Group, from: string, to: string, amount: number, extra: Record<string, unknown> = {}) =>
    api("post", `/workspaces/${g.workspaceId}/settlements`, tokenFor(g.ids[from]), { toId: g.ids[to], amount, method: "BANK", ...extra });

  /** IR-04: A nợ B 50k, B nợ C 50k. Trả về id 2 khoản chi. */
  async function chain(g: Group): Promise<{ e1: string; e2: string }> {
    const { A, B, C } = g.ids;
    const e1 = await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(B), expenseBody(B, [A, B], { amount: 100_000 }));
    const e2 = await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(C), expenseBody(C, [B, C], { amount: 100_000 }));
    return { e1: e1.body.data.id as string, e2: e2.body.data.id as string };
  }

  it("IR-04: A nợ B 50k, B nợ C 50k → gợi ý A → C 50k, số dư B = 0", async () => {
    const g = await setup({ A: "OWNER", B: "MEMBER", C: "MEMBER" });
    await chain(g);
    const sum = await summaryOf(g, "A");

    expect(sum.myBalance).toBe(-50_000);
    expect(sum.suggestions).toEqual([{ fromId: g.ids.A, toId: g.ids.C, amount: 50_000 }]);
    expect((await summaryOf(g, "B")).myBalance).toBe(0);
    expect(sum.balances.map((b: { userId: string }) => b.userId)).not.toContain(g.ids.B);
  });

  it("IR-32: A trả C theo gợi ý rồi C xác nhận → số dư cả ba = 0, share đều PAID", async () => {
    const g = await setup({ A: "OWNER", B: "MEMBER", C: "MEMBER" });
    const { e1, e2 } = await chain(g);
    const shareOfA = async () => (await api("get", `/expenses/${e1}`, tokenFor(g.ids.A))).body.data.shares[0];
    expect((await shareOfA()).status).toBe("UNPAID");

    const created = await pay(g, "A", "C", 50_000);
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe("PENDING");
    expect((await summaryOf(g, "A")).myBalance).toBe(-50_000); // PENDING chưa đổi số dư

    const confirmed = await api("post", `/settlements/${created.body.data.id}/confirm`, tokenFor(g.ids.C));
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.status).toBe("CONFIRMED");
    expect(confirmed.body.data.allocations).toEqual([expect.objectContaining({ amount: 50_000 })]);

    for (const who of ["A", "B", "C"]) expect((await summaryOf(g, who)).myBalance).toBe(0);
    expect((await shareOfA()).status).toBe("PAID");
    expect((await api("get", `/expenses/${e2}`, tokenFor(g.ids.C))).body.data.shares[0].status).toBe("PAID");
    expect((await summaryOf(g, "A")).suggestions).toEqual([]);
  });

  it("IR-05: settlement bị từ chối → số dư và share giữ nguyên", async () => {
    const g = await setup({ A: "OWNER", B: "MEMBER" });
    const { A, B } = g.ids;
    const id = (await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(A), expenseBody(A, [A, B], { amount: 100_000 }))).body.data.id as string;
    const s = await pay(g, "B", "A", 50_000);

    const rejected = await api("post", `/settlements/${s.body.data.id}/reject`, tokenFor(A), { reason: "Chưa nhận được tiền" });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe("REJECTED");
    expect(rejected.body.data.rejectReason).toBe("Chưa nhận được tiền");
    expect((await summaryOf(g, "B")).myBalance).toBe(-50_000);
    expect((await api("get", `/expenses/${id}`, tokenFor(A))).body.data.shares[0].status).toBe("UNPAID");
    // Đã từ chối thì không xác nhận/huỷ được nữa.
    expect((await api("post", `/settlements/${s.body.data.id}/confirm`, tokenFor(A))).body.error.code).toBe("WALLET_007");
    expect((await api("post", `/settlements/${s.body.data.id}/cancel`, tokenFor(B))).body.error.code).toBe("WALLET_007");
  });

  it("IR-33 / WALLET_006: vượt nợ → 400 WALLET_005; trả cho chính mình → 400 WALLET_006; trả cho người không được nợ → 400", async () => {
    const g = await setup({ A: "OWNER", B: "MEMBER", C: "MEMBER" });
    await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(g.ids.A), expenseBody(g.ids.A, [g.ids.A, g.ids.B], { amount: 100_000 }));

    expect((await pay(g, "B", "A", 50_001)).body.error.code).toBe("WALLET_005");
    expect((await pay(g, "B", "B", 1_000)).body.error.code).toBe("WALLET_006");
    // C không nợ gì → không có gì để trả; A không phải người B nợ theo số dư của C.
    expect((await pay(g, "C", "A", 1_000)).body.error.code).toBe("WALLET_005");
    expect(await prisma.settlement.count({ where: { workspaceId: g.workspaceId } })).toBe(0);
  });

  it("chỉ người nhận xác nhận/từ chối, chỉ người gửi huỷ; người ngoài 404", async () => {
    const g = await setup({ A: "OWNER", B: "MEMBER", C: "MEMBER" });
    await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(g.ids.A), expenseBody(g.ids.A, [g.ids.A, g.ids.B], { amount: 100_000 }));
    const id = (await pay(g, "B", "A", 20_000)).body.data.id as string;

    expect((await api("post", `/settlements/${id}/confirm`, tokenFor(g.ids.B))).status).toBe(403); // người gửi không tự xác nhận
    expect((await api("post", `/settlements/${id}/confirm`, tokenFor(g.ids.C))).status).toBe(403);
    expect((await api("post", `/settlements/${id}/cancel`, tokenFor(g.ids.A))).status).toBe(403); // người nhận không huỷ hộ
    expect((await api("post", `/settlements/${id}/confirm`, tokenFor(newObjectId()))).status).toBe(404);

    const cancelled = await api("post", `/settlements/${id}/cancel`, tokenFor(g.ids.B));
    expect(cancelled.body.data.status).toBe("CANCELLED");
  });

  it("IR-34: hai lần bấm xác nhận đồng thời → đúng 1 lần áp dụng, còn lại WALLET_007", async () => {
    const g = await setup({ A: "OWNER", B: "MEMBER" });
    await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(g.ids.A), expenseBody(g.ids.A, [g.ids.A, g.ids.B], { amount: 100_000 }));
    const id = (await pay(g, "B", "A", 50_000)).body.data.id as string;

    const results = await Promise.all([
      api("post", `/settlements/${id}/confirm`, tokenFor(g.ids.A)),
      api("post", `/settlements/${id}/confirm`, tokenFor(g.ids.A)),
    ]);
    const statuses = results.map((r) => r.status).sort();

    expect(statuses).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)?.body.error.code).toBe("WALLET_007");
    expect((await summaryOf(g, "B")).myBalance).toBe(0); // chỉ áp dụng MỘT lần (−50.000 + 50.000)
    expect((await summaryOf(g, "A")).myBalance).toBe(0);
  });

  it("số dư đổi giữa lúc tạo và xác nhận → xác nhận bị WALLET_005 và settlement vẫn PENDING", async () => {
    const g = await setup({ A: "OWNER", B: "MEMBER" });
    const { A, B } = g.ids;
    const eid = (await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(A), expenseBody(A, [A, B], { amount: 100_000 }))).body.data.id as string;
    const sid = (await pay(g, "B", "A", 50_000)).body.data.id as string;
    await api("delete", `/expenses/${eid}`, tokenFor(A)); // B hết nợ trước khi A xác nhận

    const res = await api("post", `/settlements/${sid}/confirm`, tokenFor(A));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("WALLET_005");
    expect((await prisma.settlement.findUnique({ where: { id: sid } }))?.status).toBe("PENDING");
    expect((await summaryOf(g, "B")).myBalance).toBe(0);
  });

  it("danh sách settlement: lọc status/mine, cursor; ghi chú + mã tham chiếu hợp lệ", async () => {
    const g = await setup({ A: "OWNER", B: "MEMBER", C: "MEMBER" });
    await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(g.ids.A), expenseBody(g.ids.A, [g.ids.A, g.ids.B, g.ids.C], { amount: 90_000 }));
    const first = await pay(g, "B", "A", 10_000, { note: "Tiền ăn", reference: "ABCDEFGH" });
    await pay(g, "C", "A", 10_000);
    expect(first.body.data.code).toBe("ABCDEFGH");
    expect(first.body.data.note).toBe("Tiền ăn");

    const mineB = await api("get", `/workspaces/${g.workspaceId}/settlements?mine=true`, tokenFor(g.ids.B));
    expect(mineB.body.data.map((s: { fromId: string }) => s.fromId)).toEqual([g.ids.B]);
    const page = await api("get", `/workspaces/${g.workspaceId}/settlements?limit=1&status=PENDING`, tokenFor(g.ids.A));
    expect(page.body.data).toHaveLength(1);
    expect(page.body.meta.hasMore).toBe(true);
    // Mã tham chiếu đã dùng thì hệ thống tự cấp mã khác.
    const dup = await pay(g, "C", "A", 5_000, { reference: "ABCDEFGH" });
    expect(dup.body.data.code).not.toBe("ABCDEFGH");
  });

  it("wallet:updated được ghi vào outbox mỗi lần đổi số dư, kèm walletVersion tăng dần, không có số tiền", async () => {
    const g = await setup({ A: "OWNER", B: "MEMBER" });
    await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(g.ids.A), expenseBody(g.ids.A, [g.ids.A, g.ids.B], { amount: 100_000 }));
    const sid = (await pay(g, "B", "A", 50_000)).body.data.id as string;
    await api("post", `/settlements/${sid}/confirm`, tokenFor(g.ids.A));

    const events = await prisma.outboxEvent.findMany({ where: { aggregateId: g.workspaceId, type: "wallet.updated" }, orderBy: { createdAt: "asc" } });
    const versions = events.map((e) => (e.payload as { walletVersion: number }).walletVersion);
    expect(versions).toEqual([1, 2, 3]);
    expect(events.map((e) => (e.payload as { reason: string }).reason)).toEqual(["EXPENSE", "SETTLEMENT", "SETTLEMENT"]);
    // Payload chỉ có id + phiên bản, tuyệt đối không có trường tiền.
    for (const e of events) {
      expect(Object.keys(e.payload as object).sort()).toEqual(["changedUserIds", "reason", "schemaVersion", "walletVersion", "workspaceId"]);
    }
  });
});
