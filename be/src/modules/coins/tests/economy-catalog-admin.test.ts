import { ErrorCode } from "../../../core/utils/error.codes";
import { newObjectId } from "../../../core/utils/object-id";
import type { CreateQuestDto, CreateShopItemDto } from "../dtos";
import { adminOf, CoinsHarness, xpAwarded } from "./support/coins-harness";

let h: CoinsHarness;
beforeEach(() => {
  h = new CoinsHarness();
});

const REASON = "Cân bằng lại kinh tế theo báo cáo tuần";

const newItem = (over: Partial<CreateShopItemDto> = {}): CreateShopItemDto => ({
  code: "frame-blue",
  name: "Khung xanh",
  kind: "AVATAR_FRAME",
  price: 120,
  data: { color: "#1D4ED8" },
  isActive: true,
  availableFrom: null,
  availableTo: null,
  reason: REASON,
  ...over,
});

describe("vật phẩm cửa hàng (admin)", () => {
  it("tạo: chuẩn hoá data (điền width mặc định), assetId null, version 1, audit trước/sau, 0 người sở hữu", async () => {
    const admin = adminOf();
    const created = await h.catalogAdmin.createItem(admin, newItem());
    expect(created).toMatchObject({ code: "frame-blue", price: 120, isActive: true, version: 1, owners: 0, assetId: null, data: { color: "#1D4ED8", width: 3 } });
    expect(h.audit.records).toEqual([expect.objectContaining({ actorId: admin.id, action: "coins.shop-item.create", targetType: "ShopItem", targetId: created.id, reason: REASON })]);
  });

  it("trùng mã → 409 (RES_002), không audit", async () => {
    await h.catalogAdmin.createItem(adminOf(), newItem());
    h.audit.records.length = 0;
    await expect(h.catalogAdmin.createItem(adminOf(), newItem({ name: "Khác" }))).rejects.toMatchObject({ statusCode: 409, code: ErrorCode.RES_002 });
    expect(h.audit.records).toHaveLength(0);
  });

  it("data không hợp lệ với loại vật phẩm → 400 VAL_001 gắn field data (không ghi gì)", async () => {
    await expect(h.catalogAdmin.createItem(adminOf(), newItem({ data: { color: "đỏ" } }))).rejects.toMatchObject({ statusCode: 400, code: ErrorCode.VAL_001, details: { data: expect.any(Array) as unknown } });
    await expect(h.catalogAdmin.createItem(adminOf(), newItem({ kind: "EMOJI_PACK", data: { color: "#000000" } }))).rejects.toMatchObject({ statusCode: 400 });
    expect(h.store.items.size).toBe(0);
  });

  it("sửa: CAS expectedVersion → RES_003 kèm phiên bản hiện tại; audit lưu giá/trạng thái trước → sau; đổi giá chỉ áp cho lần mua SAU", async () => {
    const admin = adminOf();
    const created = await h.catalogAdmin.createItem(admin, newItem({ price: 100 }));
    const u = h.addUser();
    await h.fund(u, 1000);
    await h.shop.buy(u, created.id);
    const updated = await h.catalogAdmin.updateItem(admin, created.id, { expectedVersion: 1, price: 250, reason: REASON });
    expect(updated).toMatchObject({ price: 250, version: 2, owners: 1 });
    expect(h.audit.records.at(-1)).toMatchObject({ action: "coins.shop-item.update", metadata: { before: { price: 100, version: 1 }, after: { price: 250, version: 2 }, dataChanged: false } });
    await expect(h.catalogAdmin.updateItem(admin, created.id, { expectedVersion: 1, isActive: false, reason: REASON })).rejects.toMatchObject({ statusCode: 409, code: ErrorCode.RES_003, details: { currentVersion: 2 } });
    expect(h.store.items.get(created.id)?.isActive).toBe(true);
    expect(await h.balanceOf(u)).toBe(900);
  });

  it("tắt vật phẩm → không còn mua được (COIN_003); sửa data kiểm theo kind HIỆN CÓ; khung thời gian không hợp lệ bị từ chối", async () => {
    const admin = adminOf();
    const item = await h.catalogAdmin.createItem(admin, newItem());
    await h.catalogAdmin.updateItem(admin, item.id, { expectedVersion: 1, isActive: false, reason: REASON });
    const u = h.addUser();
    await h.fund(u, 500);
    await expect(h.shop.buy(u, item.id)).rejects.toMatchObject({ code: ErrorCode.COIN_003 });
    await expect(h.catalogAdmin.updateItem(admin, item.id, { expectedVersion: 2, data: { emojis: ["😀"] }, reason: REASON })).rejects.toMatchObject({ statusCode: 400 });
    const from = new Date(Date.UTC(2026, 5, 2));
    await expect(h.catalogAdmin.updateItem(admin, item.id, { expectedVersion: 2, availableFrom: from, availableTo: new Date(from.getTime() - 1), reason: REASON })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("id không tồn tại → 404; danh sách kèm số người sở hữu (kể cả vật phẩm đã tắt)", async () => {
    await expect(h.catalogAdmin.updateItem(adminOf(), newObjectId(), { expectedVersion: 1, price: 5, reason: REASON })).rejects.toMatchObject({ statusCode: 404 });
    const item = await h.catalogAdmin.createItem(adminOf(), newItem());
    const u = h.addUser();
    await h.fund(u, 500);
    await h.shop.buy(u, item.id);
    await h.catalogAdmin.updateItem(adminOf(), item.id, { expectedVersion: 1, isActive: false, reason: REASON });
    expect(await h.catalogAdmin.listItems()).toEqual([expect.objectContaining({ id: item.id, isActive: false, owners: 1 })]);
  });
});

describe("luật thưởng xu (admin)", () => {
  it("tạo luật mới (expectedVersion 0) rồi sửa bằng CAS; audit before null → after; cache luật bị xoá nên có hiệu lực NGAY ở instance này", async () => {
    const admin = adminOf();
    const u = h.addUser();
    const created = await h.catalogAdmin.putRule(admin, "TASK_COMPLETED", { coins: 3, dailyCap: 30, isActive: true, expectedVersion: 0, reason: REASON });
    expect(created).toMatchObject({ sourceType: "TASK_COMPLETED", coins: 3, dailyCap: 30, version: 1 });
    expect(h.audit.records[0]).toMatchObject({ action: "coins.rule.update", targetId: "TASK_COMPLETED", metadata: { before: null, after: { coins: 3, version: 1 } } });
    await h.earn.handleXpAwarded(xpAwarded(u));
    await h.catalogAdmin.putRule(admin, "TASK_COMPLETED", { coins: 8, dailyCap: 30, isActive: true, expectedVersion: 1, reason: REASON });
    await h.earn.handleXpAwarded(xpAwarded(u));
    expect(h.store.ledger.filter((r) => r.type === "EARN_EVENT").map((r) => r.amount)).toEqual([3, 8]);
    expect(h.audit.records.at(-1)).toMatchObject({ metadata: { before: { coins: 3, version: 1 }, after: { coins: 8, version: 2 } } });
  });

  it("lệch phiên bản → RES_003; tạo với expectedVersion ≠ 0 khi chưa có luật → RES_003", async () => {
    const admin = adminOf();
    await expect(h.catalogAdmin.putRule(admin, "QUIZ_PASSED", { coins: 5, dailyCap: null, isActive: true, expectedVersion: 3, reason: REASON })).rejects.toMatchObject({ code: ErrorCode.RES_003 });
    await h.catalogAdmin.putRule(admin, "QUIZ_PASSED", { coins: 5, dailyCap: null, isActive: true, expectedVersion: 0, reason: REASON });
    await expect(h.catalogAdmin.putRule(admin, "QUIZ_PASSED", { coins: 6, dailyCap: null, isActive: true, expectedVersion: 0, reason: REASON })).rejects.toMatchObject({ code: ErrorCode.RES_003, details: { currentVersion: 1 } });
  });

  it("danh sách luật kèm xu đã phát 7 ngày gần nhất", async () => {
    const u = h.addUser();
    h.addRule("TASK_COMPLETED", { coins: 4 });
    h.addRule("QUIZ_PASSED", { coins: 6 });
    await h.earn.handleXpAwarded(xpAwarded(u));
    await h.earn.handleXpAwarded(xpAwarded(u));
    await h.earn.handleXpAwarded(xpAwarded(u, { sourceType: "QUIZ_PASSED" }));
    const rules = await h.catalogAdmin.listRules();
    expect(rules.map((r) => [r.sourceType, r.issued7d])).toEqual([["QUIZ_PASSED", 6], ["TASK_COMPLETED", 8]]);
  });
});

describe("nhiệm vụ ngày (admin)", () => {
  const newQuest = (over: Partial<CreateQuestDto> = {}): CreateQuestDto => ({ code: "daily-x", title: "Hoàn thành thẻ", description: "Hoàn thành thẻ công việc", metric: "tasksDone", target: 2, coins: 10, isActive: true, order: 0, reason: REASON, ...over });

  it("tạo/sửa/tắt có audit + CAS; trùng mã → 409; nhiệm vụ mới có hiệu lực ngay cho consumer", async () => {
    const admin = adminOf();
    const u = h.addUser();
    const q = await h.catalogAdmin.createQuest(admin, newQuest());
    await expect(h.catalogAdmin.createQuest(admin, newQuest())).rejects.toMatchObject({ statusCode: 409 });
    await h.earn.handleXpAwarded(xpAwarded(u));
    expect(h.store.progress.find((p) => p.questId === q.id)?.progress).toBe(1);
    const off = await h.catalogAdmin.updateQuest(admin, q.id, { expectedVersion: 1, isActive: false, reason: REASON });
    expect(off).toMatchObject({ isActive: false, version: 2 });
    await h.earn.handleXpAwarded(xpAwarded(u));
    expect(h.store.progress.find((p) => p.questId === q.id)?.progress).toBe(1);
    await expect(h.catalogAdmin.updateQuest(admin, q.id, { expectedVersion: 1, coins: 50, reason: REASON })).rejects.toMatchObject({ code: ErrorCode.RES_003 });
    expect(h.audit.records.map((r) => r.action)).toEqual(["coins.quest.create", "coins.quest.update"]);
  });

  it("id không tồn tại → 404", async () => {
    await expect(h.catalogAdmin.updateQuest(adminOf(), newObjectId(), { expectedVersion: 1, coins: 5, reason: REASON })).rejects.toMatchObject({ statusCode: 404 });
  });
});
