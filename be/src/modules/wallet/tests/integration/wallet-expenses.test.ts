import { installMocks, redisStore } from "./wallet-test-mocks";
import { buildWalletApp, cleanupGroups, expenseBody, makeApi, seedGroup, tokenFor, type Group } from "./wallet-test-kit";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";

const app = buildWalletApp();
const api = makeApi(app);

describe("wallet — khoản chi (integration, Mongo memory replset)", () => {
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

  it("IR-03: 150.000 chia đều 4 người (gồm người trả) → 3 share 37.500, người trả không nợ", async () => {
    const g = await setup({ A: "OWNER", B: "MEMBER", C: "MEMBER", D: "MEMBER" });
    const { A, B, C, D } = g.ids;
    const res = await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(A), expenseBody(A, [A, B, C, D]));

    expect(res.status).toBe(201);
    const shares = res.body.data.shares as { debtorId: string; amount: number; status: string }[];
    expect(shares.map((s) => s.amount)).toEqual([37_500, 37_500, 37_500]);
    expect(shares.map((s) => s.debtorId)).not.toContain(A);
    expect(shares.every((s) => s.status === "UNPAID")).toBe(true);

    const sum = await summaryOf(g, "A");
    expect(sum.myBalance).toBe(112_500);
    expect((await summaryOf(g, "B")).myBalance).toBe(-37_500);
    expect(sum.totals.outstanding).toBe(112_500);
  });

  it("IR-31: 100.000 chia 3 người KHÔNG gồm người trả → 33.333 × 3, người trả được nợ 99.999", async () => {
    const g = await setup({ A: "OWNER", B: "MEMBER", C: "MEMBER", D: "MEMBER" });
    const { A, B, C, D } = g.ids;
    const res = await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(A), expenseBody(A, [B, C, D], { amount: 100_000 }));

    expect(res.status).toBe(201);
    expect((res.body.data.shares as { amount: number }[]).map((s) => s.amount)).toEqual([33_333, 33_333, 33_333]);
    expect((await summaryOf(g, "A")).myBalance).toBe(99_999);
  });

  it("WALLET_001: người tham gia không thuộc nhóm / là GUEST → 400 kèm invalidUserIds", async () => {
    const g = await setup({ A: "OWNER", B: "MEMBER", G: "GUEST" });
    const outsider = newObjectId();
    const res = await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(g.ids.A), expenseBody(g.ids.A, [g.ids.B, g.ids.G, outsider]));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("WALLET_001");
    expect(res.body.error.details.invalidUserIds.sort()).toEqual([g.ids.G, outsider].sort());
  });

  it("WALLET_002: CUSTOM tổng lệch → 400; PERCENT tổng ≠ 10000 → 400", async () => {
    const g = await setup({ A: "OWNER", B: "MEMBER" });
    const { A, B } = g.ids;
    const custom = await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(A),
      expenseBody(A, [], { amount: 100_000, splitType: "CUSTOM", participants: [{ userId: A, amount: 30_000 }, { userId: B, amount: 60_000 }] }));
    const percent = await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(A),
      expenseBody(A, [], { splitType: "PERCENT", participants: [{ userId: A, bps: 5000 }, { userId: B, bps: 4000 }] }));

    expect(custom.status).toBe(400);
    expect(custom.body.error.code).toBe("WALLET_002");
    expect(percent.body.error.code).toBe("WALLET_002");
    expect(await prisma.workspaceExpense.count({ where: { workspaceId: g.workspaceId } })).toBe(0);
  });

  it("validation: EQUAL kèm amount, số tiền âm, mô tả rỗng → 400 VAL_001", async () => {
    const g = await setup({ A: "OWNER", B: "MEMBER" });
    const { A, B } = g.ids;
    const bad = [
      expenseBody(A, [], { participants: [{ userId: B, amount: 5 }] }),
      expenseBody(A, [A, B], { amount: -5 }),
      expenseBody(A, [A, B], { description: "  " }),
      expenseBody(A, [A, A]),
    ];
    for (const body of bad) {
      const res = await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(A), body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VAL_001");
    }
  });

  it("IR-36: GUEST và người ngoài nhóm gọi ví → 404 (summary, list, ghi khoản chi)", async () => {
    const g = await setup({ A: "OWNER", G: "GUEST" });
    const outsider = tokenFor(newObjectId());
    for (const token of [tokenFor(g.ids.G), outsider]) {
      expect((await api("get", `/workspaces/${g.workspaceId}/wallet/summary`, token)).status).toBe(404);
      expect((await api("get", `/workspaces/${g.workspaceId}/expenses`, token)).status).toBe(404);
      expect((await api("post", `/workspaces/${g.workspaceId}/expenses`, token, expenseBody(g.ids.A, [g.ids.A]))).status).toBe(404);
    }
  });

  it("nhóm đã lưu trữ: vẫn ĐỌC được ví nhưng mọi thao tác ghi tiền bị chặn (WS_002)", async () => {
    const g = await setup({ A: "OWNER", B: "MEMBER" });
    const { A, B } = g.ids;
    const id = (await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(A), expenseBody(A, [A, B]))).body.data.id as string;
    const sid = (await api("post", `/workspaces/${g.workspaceId}/settlements`, tokenFor(B), { toId: A, amount: 10_000, method: "CASH" })).body.data.id as string;
    await prisma.workspace.update({ where: { id: g.workspaceId }, data: { status: "ARCHIVED" } });

    expect((await api("get", `/workspaces/${g.workspaceId}/wallet/summary`, tokenFor(B))).status).toBe(200);
    expect((await api("get", `/expenses/${id}`, tokenFor(B))).status).toBe(200);
    const writes = [
      api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(A), expenseBody(A, [A, B])),
      api("patch", `/expenses/${id}`, tokenFor(A), { expectedVersion: 1, description: "x" }),
      api("delete", `/expenses/${id}`, tokenFor(A)),
      api("post", `/workspaces/${g.workspaceId}/settlements`, tokenFor(B), { toId: A, amount: 1_000, method: "CASH" }),
      api("post", `/settlements/${sid}/confirm`, tokenFor(A)),
    ];
    for (const res of await Promise.all(writes)) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("WS_002");
    }
  });

  it("Idempotency-Key: gửi lại cùng khoá → chỉ 1 khoản chi", async () => {
    const g = await setup({ A: "OWNER", B: "MEMBER" });
    const key = `idem-${newObjectId()}`;
    const body = expenseBody(g.ids.A, [g.ids.A, g.ids.B]);
    const first = await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(g.ids.A), body, { "Idempotency-Key": key });
    const second = await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(g.ids.A), body, { "Idempotency-Key": key });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(await prisma.workspaceExpense.count({ where: { workspaceId: g.workspaceId } })).toBe(1);
  });

  it("danh sách cursor: có myShare, phân trang không lặp, lọc theo người/danh mục", async () => {
    const g = await setup({ A: "OWNER", B: "MEMBER", C: "MEMBER" });
    const { A, B, C } = g.ids;
    for (let i = 0; i < 5; i += 1) {
      const occurredAt = new Date(Date.UTC(2026, 8, 1 + i)).toISOString();
      await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(A), expenseBody(A, [A, B], { amount: 20_000 + i, occurredAt, category: i % 2 ? "FOOD" : "TRANSPORT" }));
    }
    const p1 = await api("get", `/workspaces/${g.workspaceId}/expenses?limit=2`, tokenFor(B));
    const p2 = await api("get", `/workspaces/${g.workspaceId}/expenses?limit=2&cursor=${p1.body.meta.nextCursor}`, tokenFor(B));
    const ids = [...p1.body.data, ...p2.body.data].map((e: { id: string }) => e.id);

    expect(p1.body.meta.hasMore).toBe(true);
    expect(new Set(ids).size).toBe(4);
    expect(p1.body.data[0].myShare.amount).toBeGreaterThan(0);
    expect((await api("get", `/workspaces/${g.workspaceId}/expenses?category=FOOD`, tokenFor(B))).body.data).toHaveLength(2);
    // C không tham gia khoản nào → lọc theo C rỗng, và C thấy myShare = null.
    expect((await api("get", `/workspaces/${g.workspaceId}/expenses?userId=${C}`, tokenFor(A))).body.data).toHaveLength(0);
    expect((await api("get", `/workspaces/${g.workspaceId}/expenses`, tokenFor(C))).body.data[0].myShare).toBeNull();
  });

  describe("sửa / xoá / điều chỉnh", () => {
    it("sửa khi chưa ai trả: số dư tính lại; MEMBER không phải người tạo → 403, ADMIN được", async () => {
      const g = await setup({ A: "OWNER", B: "MEMBER", C: "MEMBER", D: "ADMIN" });
      const { A, B, C, D } = g.ids;
      const created = await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(B), expenseBody(B, [A, B, C], { amount: 90_000 }));
      const id = created.body.data.id as string;
      expect(created.body.data.canManage).toBe(true);

      const forbidden = await api("patch", `/expenses/${id}`, tokenFor(C), { expectedVersion: 1, description: "hack" });
      expect(forbidden.status).toBe(403);

      const updated = await api("patch", `/expenses/${id}`, tokenFor(D), { expectedVersion: 1, amount: 60_000 });
      expect(updated.status).toBe(200);
      expect(updated.body.data.version).toBe(2);
      expect((await summaryOf(g, "A")).myBalance).toBe(-20_000);
      expect((await summaryOf(g, "B")).myBalance).toBe(40_000);
    });

    it("expectedVersion lệch → 409 RES_003; xoá mềm hoàn số dư và VOID share", async () => {
      const g = await setup({ A: "OWNER", B: "MEMBER" });
      const { A, B } = g.ids;
      const id = (await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(A), expenseBody(A, [A, B]))).body.data.id as string;

      const stale = await api("patch", `/expenses/${id}`, tokenFor(A), { expectedVersion: 7, description: "x" });
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe("RES_003");

      expect((await api("delete", `/expenses/${id}`, tokenFor(A))).status).toBe(200);
      expect((await summaryOf(g, "B")).myBalance).toBe(0);
      expect((await api("get", `/expenses/${id}`, tokenFor(A))).status).toBe(404);
      expect(await prisma.expenseShare.count({ where: { expenseId: id, status: "VOID" } })).toBe(1);
    });

    it("IR-38: đã có share được thanh toán → sửa/xoá 409 WALLET_004; tạo điều chỉnh (share âm) hoàn tiền phần dư", async () => {
      const g = await setup({ A: "OWNER", B: "MEMBER", C: "MEMBER", D: "MEMBER" });
      const { A, B, C, D } = g.ids;
      const id = (await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(A), expenseBody(A, [A, B, C, D]))).body.data.id as string;
      const settle = await api("post", `/workspaces/${g.workspaceId}/settlements`, tokenFor(B), { toId: A, amount: 37_500, method: "CASH" });
      await api("post", `/settlements/${settle.body.data.id}/confirm`, tokenFor(A));

      const edit = await api("patch", `/expenses/${id}`, tokenFor(A), { expectedVersion: 1, description: "sửa" });
      const del = await api("delete", `/expenses/${id}`, tokenFor(A));
      expect(edit.status).toBe(409);
      expect(edit.body.error.code).toBe("WALLET_004");
      expect(del.body.error.code).toBe("WALLET_004");

      // Thực chi chỉ 120.000 (30.000/người): B đã trả 37.500 nên được hoàn 7.500; C, D còn nợ 30.000.
      const adj = await api("post", `/expenses/${id}/adjustments`, tokenFor(A),
        { amount: 120_000, description: "Điều chỉnh", splitType: "EQUAL", participants: [A, B, C, D].map((userId) => ({ userId })) });
      expect(adj.status).toBe(201);
      expect(adj.body.data.kind).toBe("ADJUSTMENT");
      expect(adj.body.data.amount).toBe(-30_000);
      expect((adj.body.data.shares as { amount: number }[]).map((s) => s.amount)).toEqual([-7_500, -7_500, -7_500]);

      expect((await summaryOf(g, "B")).myBalance).toBe(7_500);
      expect((await summaryOf(g, "C")).myBalance).toBe(-30_000);
      const detail = (await api("get", `/expenses/${id}`, tokenFor(A))).body.data;
      expect(detail.adjustments).toHaveLength(1);
      const shareOf = (u: string) => detail.shares.find((s: { debtorId: string }) => s.debtorId === u);
      expect(shareOf(B).status).toBe("PAID");
      expect(shareOf(C).status).toBe("PARTIAL"); // 37.500 gốc − 7.500 điều chỉnh = 30.000 còn nợ
      expect(shareOf(C).paidAmount).toBe(7_500);
    });

    it("điều chỉnh không đổi gì → 400; điều chỉnh khoản điều chỉnh → 400", async () => {
      const g = await setup({ A: "OWNER", B: "MEMBER" });
      const { A, B } = g.ids;
      const id = (await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(A), expenseBody(A, [A, B], { amount: 100_000 }))).body.data.id as string;
      const same = { amount: 100_000, description: "y", splitType: "EQUAL", participants: [{ userId: A }, { userId: B }] };
      expect((await api("post", `/expenses/${id}/adjustments`, tokenFor(A), same)).status).toBe(400);

      const adj = await api("post", `/expenses/${id}/adjustments`, tokenFor(A), { ...same, amount: 80_000 });
      expect(adj.status).toBe(201);
      expect((await api("post", `/expenses/${adj.body.data.id}/adjustments`, tokenFor(A), same)).status).toBe(400);
    });
  });

  it("xuất CSV: BOM UTF-8, đúng nội dung, chống CSV injection; GUEST bị 404", async () => {
    const g = await setup({ A: "OWNER", B: "MEMBER", G: "GUEST" });
    await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(g.ids.A), expenseBody(g.ids.A, [g.ids.A, g.ids.B], { description: "=HYPERLINK(\"x\")" }));

    const res = await api("get", `/workspaces/${g.workspaceId}/wallet/export?kind=expenses`, tokenFor(g.ids.B));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("wallet-expenses-");
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    expect(res.text).toContain("'=HYPERLINK");
    expect(res.text).toContain("Người A");
    expect((await api("get", `/workspaces/${g.workspaceId}/wallet/export`, tokenFor(g.ids.G))).status).toBe(404);
  });
});
