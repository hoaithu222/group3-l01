import { LIMITS } from "../../../core/constants/limits";
import { checkShopItemData } from "../domain/shop-item-data";
import {
  adjustSchema,
  createQuestSchema,
  createShopItemSchema,
  kindQuerySchema,
  overviewQuerySchema,
  putRuleSchema,
  sourceTypeParamSchema,
  txQuerySchema,
  updateQuestSchema,
  updateShopItemSchema,
} from "../dtos";

const REASON = "Lý do đủ dài để hợp lệ";

describe("adjustSchema — điều chỉnh xu của admin", () => {
  it("hợp lệ: số nguyên ≠ 0, |amount| ≤ trần cứng, lý do 10–500", () => {
    expect(adjustSchema.safeParse({ amount: 100, reason: REASON }).success).toBe(true);
    expect(adjustSchema.safeParse({ amount: -LIMITS.coins.adjustMax, reason: REASON }).success).toBe(true);
    expect(adjustSchema.safeParse({ amount: LIMITS.coins.adjustMax, reason: REASON }).success).toBe(true);
  });

  it.each([[0], [LIMITS.coins.adjustMax + 1], [-LIMITS.coins.adjustMax - 1], [1.5], ["100"], [null]])("từ chối amount %p", (amount) => {
    expect(adjustSchema.safeParse({ amount, reason: REASON }).success).toBe(false);
  });

  it("thiếu/ngắn lý do bị từ chối", () => {
    expect(adjustSchema.safeParse({ amount: 5 }).success).toBe(false);
    expect(adjustSchema.safeParse({ amount: 5, reason: "ngắn" }).success).toBe(false);
  });
});

describe("truy vấn", () => {
  it("txQuerySchema: mặc định limit theo LIMITS.pagination, chặn > trần, lọc loại hợp lệ", () => {
    expect(txQuerySchema.parse({})).toEqual({ limit: LIMITS.pagination.default });
    expect(txQuerySchema.safeParse({ limit: LIMITS.pagination.max + 1 }).success).toBe(false);
    expect(txQuerySchema.safeParse({ type: "EARN_EVENT", limit: "5" }).success).toBe(true);
    expect(txQuerySchema.safeParse({ type: "KHONG_CO" }).success).toBe(false);
  });

  it("kindQuerySchema chỉ nhận loại vật phẩm hợp lệ", () => {
    expect(kindQuerySchema.safeParse({ kind: "AVATAR_FRAME" }).success).toBe(true);
    expect(kindQuerySchema.safeParse({ kind: "SWORD" }).success).toBe(false);
  });

  it("overviewQuerySchema: mặc định 7 ngày, tối đa 31 (mỗi ngày một truy vấn)", () => {
    expect(overviewQuerySchema.parse({}).days).toBe(LIMITS.coins.overviewDefaultDays);
    expect(overviewQuerySchema.safeParse({ days: LIMITS.coins.overviewMaxDays + 1 }).success).toBe(false);
    expect(overviewQuerySchema.safeParse({ days: 0 }).success).toBe(false);
  });

  it("sourceTypeParamSchema từ chối ADMIN_ADJUST (không có luật xu cho điều chỉnh XP thủ công)", () => {
    expect(sourceTypeParamSchema.safeParse({ sourceType: "TASK_COMPLETED" }).success).toBe(true);
    expect(sourceTypeParamSchema.safeParse({ sourceType: "ADMIN_ADJUST" }).success).toBe(false);
  });
});

describe("createShopItemSchema / updateShopItemSchema", () => {
  const base = { code: "frame-gold", name: "Khung vàng", kind: "AVATAR_FRAME", price: 150, data: { color: "#F5B301" }, reason: REASON };

  it("hợp lệ; ngày ISO có offset được đổi sang Date, mặc định isActive=true và mốc null", () => {
    const parsed = createShopItemSchema.parse({ ...base, availableFrom: "2026-03-01T00:00:00+07:00" });
    expect(parsed.availableFrom).toBeInstanceOf(Date);
    expect(parsed).toMatchObject({ isActive: true, availableTo: null });
  });

  it.each([
    ["màu sai", { data: { color: "đỏ" } }],
    ["khoá lạ trong data", { data: { color: "#000000", url: "http://x" } }],
    ["giá 0", { price: 0 }],
    ["giá vượt trần shop", { price: LIMITS.shop.priceMax + 1 }],
    ["giá thực", { price: 9.5 }],
    ["mã viết hoa", { code: "Frame" }],
    ["khoá lạ ở ngoài (assetId — chưa hỗ trợ)", { assetId: "6512ab6512ab6512ab6512ab" }],
    ["kết thúc trước bắt đầu", { availableFrom: "2026-03-02T00:00:00Z", availableTo: "2026-03-01T00:00:00Z" }],
    ["thiếu lý do", { reason: undefined }],
  ])("từ chối: %s", (_name, patch) => {
    expect(createShopItemSchema.safeParse({ ...base, ...patch }).success).toBe(false);
  });

  it("gói emoji: tối đa số emoji cho phép; theme cần đủ hai màu", () => {
    const emojis = Array.from({ length: LIMITS.shop.emojiPackMax + 1 }, () => "😀");
    expect(createShopItemSchema.safeParse({ ...base, kind: "EMOJI_PACK", data: { emojis } }).success).toBe(false);
    expect(createShopItemSchema.safeParse({ ...base, kind: "EMOJI_PACK", data: { emojis: emojis.slice(1) } }).success).toBe(true);
    expect(createShopItemSchema.safeParse({ ...base, kind: "PROFILE_THEME", data: { primary: "#111111" } }).success).toBe(false);
  });

  it("checkShopItemData: điền mặc định; mọi trường có trần nên data không thể phình to", () => {
    expect(checkShopItemData("AVATAR_FRAME", { color: "#000000" })).toEqual({ ok: true, data: { color: "#000000", width: 3 } });
    const worst = Array.from({ length: LIMITS.shop.emojiPackMax }, () => "x".repeat(16));
    const checked = checkShopItemData("EMOJI_PACK", { emojis: worst });
    expect(checked.ok).toBe(true);
    expect(JSON.stringify(checked.ok ? checked.data : null).length).toBeLessThan(1000);
    expect(checkShopItemData("EMOJI_PACK", { emojis: ["x".repeat(17)] })).toMatchObject({ ok: false });
  });

  it("update: KHÔNG cho gửi kind/code/assetId (strict); bắt buộc expectedVersion + lý do", () => {
    const ok = { expectedVersion: 1, price: 200, reason: REASON };
    expect(updateShopItemSchema.safeParse(ok).success).toBe(true);
    expect(updateShopItemSchema.safeParse({ ...ok, kind: "PROFILE_THEME" }).success).toBe(false);
    expect(updateShopItemSchema.safeParse({ ...ok, code: "moi" }).success).toBe(false);
    expect(updateShopItemSchema.safeParse({ price: 200, reason: REASON }).success).toBe(false);
  });
});

describe("putRuleSchema / quest schemas", () => {
  it("luật: xu 1–ruleCoinsMax, trần ngày 1–dailyEarnCap hoặc null, expectedVersion mặc định 0", () => {
    expect(putRuleSchema.parse({ coins: 5, dailyCap: null, isActive: true, reason: REASON }).expectedVersion).toBe(0);
    for (const bad of [{ coins: 0 }, { coins: LIMITS.coins.ruleCoinsMax + 1 }, { dailyCap: LIMITS.coins.dailyEarnCap + 1 }, { dailyCap: 0 }]) {
      expect(putRuleSchema.safeParse({ coins: 5, dailyCap: 10, isActive: true, reason: REASON, ...bad }).success).toBe(false);
    }
  });

  it("nhiệm vụ: metric thuộc whitelist, target ≤ trần, xu ≤ trần; update không đổi code", () => {
    const base = { code: "daily-x", title: "Tên", description: "Mô tả nhiệm vụ", metric: "tasksDone", target: 3, coins: 10, reason: REASON };
    expect(createQuestSchema.safeParse(base).success).toBe(true);
    for (const bad of [{ metric: "messagesSent" }, { target: LIMITS.coins.questTargetMax + 1 }, { coins: 0 }, { coins: LIMITS.coins.questCoinsMax + 1 }]) {
      expect(createQuestSchema.safeParse({ ...base, ...bad }).success).toBe(false);
    }
    expect(updateQuestSchema.safeParse({ expectedVersion: 1, coins: 20, reason: REASON }).success).toBe(true);
    expect(updateQuestSchema.safeParse({ expectedVersion: 1, code: "moi", reason: REASON }).success).toBe(false);
  });
});
