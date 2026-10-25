import { ErrorCode } from "../../../core/utils/error.codes";
import { newObjectId } from "../../../core/utils/object-id";
import { ParallelTxRunner } from "../repositories/tx.inmemory";
import { CoinLedgerService } from "../services/coin-ledger.service";
import { ShopService } from "../services/shop.service";
import { CoinsHarness } from "./support/coins-harness";

let h: CoinsHarness;
beforeEach(() => {
  h = new CoinsHarness();
});

describe("GET /shop/items", () => {
  it("chỉ vật phẩm ĐANG bán (bật + trong khung thời gian) kèm owned/equipped/inventoryId", async () => {
    const u = h.addUser();
    const now = h.clockMs;
    const on = h.addItem({ code: "on", price: 10 });
    h.addItem({ code: "off", isActive: false });
    h.addItem({ code: "future", availableFrom: new Date(now + 3_600_000) });
    h.addItem({ code: "ended", availableTo: new Date(now - 1) });
    const windowed = h.addItem({ code: "windowed", price: 20, availableFrom: new Date(now - 1000), availableTo: new Date(now + 1000) });
    await h.fund(u, 100);
    await h.shop.buy(u, on.id);
    const list = await h.shop.list(u);
    expect(list.map((i) => i.code)).toEqual(["on", "windowed"]);
    expect(list.find((i) => i.code === "on")).toMatchObject({ owned: true, equipped: false, inventoryId: expect.any(String) as string });
    expect(list.find((i) => i.id === windowed.id)).toMatchObject({ owned: false, inventoryId: null });
  });

  it("lọc theo kind", async () => {
    const u = h.addUser();
    h.addItem({ kind: "AVATAR_FRAME", code: "f" });
    h.addItem({ kind: "PROFILE_THEME", code: "t", data: { primary: "#000000", accent: "#ffffff" } });
    expect((await h.shop.list(u, "PROFILE_THEME")).map((i) => i.code)).toEqual(["t"]);
  });
});

describe("POST /shop/items/:id/buy", () => {
  it("mua thành công: trừ xu qua sổ cái SPEND_SHOP (refId = itemId), cấp kho đồ, cập nhật tổng đã tiêu, phát socket SHOP", async () => {
    const u = h.addUser();
    const item = h.addItem({ price: 120 });
    await h.fund(u, 200);
    const res = await h.shop.buy(u, item.id);
    expect(res.balance).toBe(80);
    expect(res.inventoryItem).toMatchObject({ itemId: item.id, kind: "AVATAR_FRAME", equipped: false, item: { code: item.code, price: 120 } });
    expect(h.store.ledger.find((r) => r.type === "SPEND_SHOP")).toMatchObject({ userId: u, amount: -120, refType: "SHOP_ITEM", refId: item.id, balanceAfter: 80 });
    expect(await h.wallets.find(u)).toMatchObject({ balance: 80, lifetimeSpent: 120 });
    expect(h.emitter.events.at(-1)).toEqual({ userId: u, payload: { coins: { balance: 80, delta: -120, reason: "SHOP" } } });
  });

  it("GM-06: thiếu xu → COIN_001, ví KHÔNG đổi, KHÔNG có kho đồ/dòng ledger mới, không phát socket", async () => {
    const u = h.addUser();
    const item = h.addItem({ price: 150 });
    await h.fund(u, 100);
    const rows = h.store.ledger.length;
    const events = h.emitter.events.length;
    await expect(h.shop.buy(u, item.id)).rejects.toMatchObject({ code: ErrorCode.COIN_001, statusCode: 400, details: { balance: 100, required: 150 } });
    expect(await h.balanceOf(u)).toBe(100);
    expect(h.store.inventory).toHaveLength(0);
    expect(h.store.ledger).toHaveLength(rows);
    expect(h.emitter.events).toHaveLength(events);
  });

  it("đã sở hữu → COIN_002 (409), không trừ lần hai", async () => {
    const u = h.addUser();
    const item = h.addItem({ price: 50 });
    await h.fund(u, 200);
    await h.shop.buy(u, item.id);
    await expect(h.shop.buy(u, item.id)).rejects.toMatchObject({ code: ErrorCode.COIN_002, statusCode: 409 });
    expect(await h.balanceOf(u)).toBe(150);
    expect(h.store.inventory).toHaveLength(1);
  });

  it("không còn bán → COIN_003 (404): đã tắt, chưa tới/đã hết khung thời gian, hoặc không tồn tại", async () => {
    const u = h.addUser();
    await h.fund(u, 500);
    const off = h.addItem({ isActive: false });
    const future = h.addItem({ availableFrom: new Date(h.clockMs + 1000) });
    const ended = h.addItem({ availableTo: new Date(h.clockMs) });
    for (const id of [off.id, future.id, ended.id, newObjectId()]) {
      await expect(h.shop.buy(u, id)).rejects.toMatchObject({ code: ErrorCode.COIN_003, statusCode: 404 });
    }
    expect(await h.balanceOf(u)).toBe(500);
  });

  it("giá lấy từ bản ghi TẠI LÚC mua: admin đổi giá thì lần mua sau theo giá mới, lần trước không bị hồi tố", async () => {
    const u = h.addUser();
    const item = h.addItem({ price: 100 });
    await h.fund(u, 500);
    await h.shop.buy(u, item.id);
    const other = h.addItem({ price: 100 });
    const stored = h.store.items.get(other.id);
    if (stored) stored.price = 300;
    await h.shop.buy(u, other.id);
    expect(await h.balanceOf(u)).toBe(100);
  });

  it("20 yêu cầu mua song song KHÁC vật phẩm với số dư chỉ đủ MỘT → đúng một thành công (CAS trên ví)", async () => {
    const u = h.addUser();
    const items = Array.from({ length: 20 }, (_, i) => h.addItem({ price: 100, code: `it-${String(i)}` }));
    await h.fund(u, 100);
    const results = await Promise.allSettled(items.map((i) => h.shop.buy(u, i.id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toMatchObject({ code: ErrorCode.COIN_001 });
    expect(await h.balanceOf(u)).toBe(0);
    expect(h.store.inventory).toHaveLength(1);
  });

  it("20 yêu cầu mua song song CÙNG vật phẩm (cùng người) → đúng một thành công, số dư chỉ trừ một lần", async () => {
    const u = h.addUser();
    const item = h.addItem({ price: 60 });
    await h.fund(u, 1000);
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => h.shop.buy(u, item.id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toMatchObject({ code: ErrorCode.COIN_002 });
    expect(await h.balanceOf(u)).toBe(940);
  });

  it("CAS còn đúng khi các bước XEN KẼ thật sự (không tuần tự hoá): số dư đủ 3 lần mua, 20 yêu cầu → đúng 3 thành công", async () => {
    const u = h.addUser();
    const items = Array.from({ length: 20 }, (_, i) => h.addItem({ price: 100, code: `p-${String(i)}` }));
    await h.fund(u, 300);
    const parallelLedger = new CoinLedgerService({ wallets: h.wallets, ledger: h.ledgerRepo, tx: new ParallelTxRunner(), config: h.config });
    const shop = new ShopService({ items: h.items, inventory: h.inventory, ledger: parallelLedger, tx: new ParallelTxRunner(), emitter: h.emitter });
    const results = await Promise.allSettled(items.map((i) => shop.buy(u, i.id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await h.balanceOf(u)).toBe(0);
    expect(h.store.ledger.filter((r) => r.type === "SPEND_SHOP")).toHaveLength(3);
    expect(h.store.ledger.every((r) => r.balanceAfter >= 0)).toBe(true);
  });

  it("lỗi sau khi trừ xu (tạo kho đồ hỏng) → HOÀN TÁC: xu không mất mà không có vật phẩm", async () => {
    const u = h.addUser();
    const item = h.addItem({ price: 100 });
    await h.fund(u, 100);
    h.tx.failAfterRun = 1;
    await expect(h.shop.buy(u, item.id)).rejects.toThrow("crash trước commit");
    expect(await h.balanceOf(u)).toBe(100);
    expect(h.store.inventory).toHaveLength(0);
    await expect(h.shop.buy(u, item.id)).resolves.toMatchObject({ balance: 0 });
  });

  it("dữ liệu dở dang (đã có dòng SPEND_SHOP nhưng chưa có kho đồ) → cấp vật phẩm mà KHÔNG trừ lần hai", async () => {
    const u = h.addUser();
    const item = h.addItem({ price: 100 });
    await h.fund(u, 300);
    await h.ledger.postAtomic({ userId: u, amount: -100, type: "SPEND_SHOP", refType: "SHOP_ITEM", refId: item.id });
    const res = await h.shop.buy(u, item.id);
    expect(res.balance).toBe(200);
    expect(h.store.inventory).toHaveLength(1);
    expect(h.store.ledger.filter((r) => r.type === "SPEND_SHOP")).toHaveLength(1);
  });
});

describe("kho đồ + trang bị/tháo", () => {
  async function buyTwoFrames() {
    const u = h.addUser();
    const a = h.addItem({ price: 10, code: "fa" });
    const b = h.addItem({ price: 10, code: "fb" });
    const theme = h.addItem({ price: 10, code: "th", kind: "PROFILE_THEME", data: { primary: "#111111", accent: "#222222" } });
    await h.fund(u, 100);
    const ia = (await h.shop.buy(u, a.id)).inventoryItem;
    const ib = (await h.shop.buy(u, b.id)).inventoryItem;
    const it = (await h.shop.buy(u, theme.id)).inventoryItem;
    return { u, ia, ib, it };
  }

  it("trang bị tự tháo vật phẩm CÙNG loại; vật phẩm khác loại không bị ảnh hưởng (tối đa một mỗi loại)", async () => {
    const { u, ia, ib, it } = await buyTwoFrames();
    await h.shop.equip(u, ia.id);
    await h.shop.equip(u, it.id);
    expect((await h.shop.equip(u, ib.id)).equipped).toBe(true);
    const inv = await h.shop.inventory(u);
    expect(inv.filter((x) => x.equipped).map((x) => x.id).sort()).toEqual([ib.id, it.id].sort());
    expect(inv.find((x) => x.id === ia.id)?.equipped).toBe(false);
  });

  it("tháo → equipped=false; tháo lại vẫn thành công (idempotent)", async () => {
    const { u, ia } = await buyTwoFrames();
    await h.shop.equip(u, ia.id);
    expect((await h.shop.unequip(u, ia.id)).equipped).toBe(false);
    expect((await h.shop.unequip(u, ia.id)).equipped).toBe(false);
  });

  it("id kho đồ của NGƯỜI KHÁC hoặc không tồn tại → 404 giống nhau (không lộ id người khác), trạng thái không đổi", async () => {
    const { ia } = await buyTwoFrames();
    const stranger = h.addUser();
    for (const id of [ia.id, newObjectId()]) {
      await expect(h.shop.equip(stranger, id)).rejects.toMatchObject({ statusCode: 404, code: ErrorCode.RES_001 });
      await expect(h.shop.unequip(stranger, id)).rejects.toMatchObject({ statusCode: 404 });
    }
    expect(h.store.inventory.find((x) => x.id === ia.id)?.equipped).toBe(false);
  });

  it("hai lần trang bị song song hai vật phẩm cùng loại vẫn cho tối đa MỘT đang trang bị", async () => {
    const { u, ia, ib } = await buyTwoFrames();
    await Promise.all([h.shop.equip(u, ia.id), h.shop.equip(u, ib.id)]);
    expect((await h.shop.inventory(u, "AVATAR_FRAME")).filter((x) => x.equipped)).toHaveLength(1);
  });

  it("đọc vật phẩm đang trang bị của nhiều người (cổng public cho hồ sơ): chỉ token hiển thị, người không trang bị không có mặt", async () => {
    const { u, ia, it } = await buyTwoFrames();
    const other = h.addUser();
    await h.shop.equip(u, ia.id);
    await h.shop.equip(u, it.id);
    const map = await h.equipped.forUsers([u, other]);
    expect(map.has(other)).toBe(false);
    expect(map.get(u)?.map((e) => e.kind).sort()).toEqual(["AVATAR_FRAME", "PROFILE_THEME"]);
    expect(Object.keys(map.get(u)?.[0] ?? {}).sort()).toEqual(["assetId", "code", "data", "itemId", "kind", "name"]);
  });
});
