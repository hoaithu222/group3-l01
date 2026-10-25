import { LIMITS } from "../../../core/constants/limits";
import { AVAILABLE_MODULES, MODULES } from "../../../core/constants/modules";
import { getEffective, initRuntimeConfig, resetRuntimeConfig, type ISystemConfigReader, type SystemConfigSnapshot } from "../../../core/config/runtime-config";
import { SYSTEM_CONFIG_REGISTRY } from "../../../core/config/system-config.registry";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { systemConfigKeyParamSchema } from "../../system-config/dtos/update-system-config.dto";
import { coinErrors } from "../coins.errors";
import { checkShopItemData } from "../domain/shop-item-data";
import { COIN_QUEST_METRICS, COIN_SOURCE_TYPES } from "../entities/coins.interface";
import { COIN_QUEST_SEEDS, COIN_RULE_SEEDS, SHOP_ITEM_SEEDS, seedCoins } from "../seed/coins.seed";

const reader = (data: Record<string, SystemConfigSnapshot>): ISystemConfigReader => ({ findByKey: (key) => Promise.resolve(data[key] ?? null) });

describe("mã lỗi COIN_* (p7-02 be.md §8)", () => {
  const coinKeys = Object.keys(ErrorCode).filter((k) => k.startsWith("COIN"));

  it("tiền tố COIN_ chỉ có các mã của module này (không trùng module khác) và mã trùng khoá = giá trị", () => {
    expect(coinKeys.sort()).toEqual(["COIN_001", "COIN_002", "COIN_003", "COIN_004", "COIN_005", "COIN_009"]);
    for (const k of coinKeys) expect(ErrorCode[k as keyof typeof ErrorCode]).toBe(k);
  });

  it("COIN_006..008 dành cho chợ tài liệu (P1) — chưa cấp phát ở P0", () => {
    for (const reserved of ["COIN_006", "COIN_007", "COIN_008"]) expect(Object.keys(ErrorCode)).not.toContain(reserved);
  });

  it("mỗi mã có thông điệp tiếng Việt; HTTP đúng bảng kế hoạch", () => {
    for (const k of coinKeys) expect(ErrorMessages[k as keyof typeof ErrorMessages].length).toBeGreaterThan(5);
    expect(coinErrors.insufficient(5, 10)).toMatchObject({ statusCode: 400, code: "COIN_001", details: { balance: 5, required: 10 } });
    expect(coinErrors.alreadyOwned()).toMatchObject({ statusCode: 409, code: "COIN_002" });
    expect(coinErrors.itemUnavailable()).toMatchObject({ statusCode: 404, code: "COIN_003" });
    expect(coinErrors.questAlreadyClaimed()).toMatchObject({ statusCode: 409, code: "COIN_004" });
    expect(coinErrors.questNotCompleted(1, 3)).toMatchObject({ statusCode: 400, code: "COIN_005", details: { progress: 1, target: 3 } });
    expect(coinErrors.balanceLimit(100)).toMatchObject({ statusCode: 400, code: "COIN_009", details: { max: 100 } });
  });
});

describe("cờ phân hệ + cấu hình", () => {
  it("cờ `coins` có mã (AVAILABLE_MODULES) nhưng mặc định vẫn TẮT (FEATURE_FLAGS mặc định)", () => {
    expect(AVAILABLE_MODULES).toContain(MODULES.COINS);
  });

  it("registry `limits.coins`: khoá 2 đoạn hợp lệ với route admin, chỉ đọc runtime; mặc định = LIMITS, admin chỉ HẠ được", () => {
    const def = SYSTEM_CONFIG_REGISTRY["limits.coins"];
    expect(def).toMatchObject({ key: "limits.coins", tab: "limits", affects: ["runtime"] });
    expect(systemConfigKeyParamSchema.safeParse({ key: "limits.coins" }).success).toBe(true);
    expect(def.fields.map((f) => f.path)).toEqual(["dailyEarnCap", "adjustMax"]);
    const cap = def.fields.find((f) => f.path === "dailyEarnCap")!;
    const adj = def.fields.find((f) => f.path === "adjustMax")!;
    expect(cap).toMatchObject({ default: LIMITS.coins.dailyEarnCap, floor: 0, ceil: LIMITS.coins.dailyEarnCap });
    expect(adj).toMatchObject({ default: LIMITS.coins.adjustMax, floor: 1, ceil: LIMITS.coins.adjustMax });
    expect(def.schema.safeParse({ dailyEarnCap: 100.5 }).success).toBe(false);
    expect(Object.keys(def.schema.parse({ dailyEarnCap: 100, balanceMax: 5 }) as Record<string, unknown>)).toEqual(["dailyEarnCap"]);
  });

  it("getEffective: mặc định khi chưa lưu; giá trị đã lưu VƯỢT trần bị clamp về trần cứng; hạ về 0 được; balanceMax không chỉnh được", async () => {
    initRuntimeConfig(reader({}));
    expect(await getEffective("limits.coins")).toEqual({ dailyEarnCap: LIMITS.coins.dailyEarnCap, adjustMax: LIMITS.coins.adjustMax });
    resetRuntimeConfig();
    initRuntimeConfig(reader({ "limits.coins": { value: { dailyEarnCap: 99_999, adjustMax: 99_999_999 }, version: 2 } }));
    expect(await getEffective("limits.coins")).toEqual({ dailyEarnCap: LIMITS.coins.dailyEarnCap, adjustMax: LIMITS.coins.adjustMax });
    resetRuntimeConfig();
    initRuntimeConfig(reader({ "limits.coins": { value: { dailyEarnCap: 0, adjustMax: 50 }, version: 3 } }));
    expect(await getEffective("limits.coins")).toEqual({ dailyEarnCap: 0, adjustMax: 50 });
    resetRuntimeConfig();
  });

  it("LIMITS.coins/shop: balanceMax nhỏ hơn Int32 nhiều để cộng không tràn; trần luật ≥ trần chung ngày không vô nghĩa", () => {
    expect(LIMITS.coins.balanceMax).toBeLessThan(2 ** 31 - 1 - LIMITS.coins.adjustMax);
    expect(LIMITS.coins.dailyEarnCap).toBeGreaterThan(0);
    expect(LIMITS.shop.priceMax).toBeLessThanOrEqual(LIMITS.coins.balanceMax);
  });
});

describe("seed đề xuất", () => {
  it("luật: nguồn hợp lệ (không ADMIN_ADJUST/SR_REVIEW), không trùng, trần luật ≤ trần chung, POMODORO_CYCLE tắt", () => {
    const sources = COIN_RULE_SEEDS.map((r) => r.sourceType);
    expect(new Set(sources).size).toBe(sources.length);
    for (const r of COIN_RULE_SEEDS) {
      expect(COIN_SOURCE_TYPES).toContain(r.sourceType);
      expect(r.coins).toBeGreaterThanOrEqual(1);
      expect(r.coins).toBeLessThanOrEqual(LIMITS.coins.ruleCoinsMax);
      if (r.dailyCap !== null) expect(r.dailyCap).toBeLessThanOrEqual(LIMITS.coins.dailyEarnCap);
    }
    expect(sources).not.toContain("SR_REVIEW");
    expect(COIN_RULE_SEEDS.find((r) => r.sourceType === "POMODORO_CYCLE")?.isActive).toBe(false);
  });

  it("nhiệm vụ: mã duy nhất, metric thuộc whitelist, số liệu trong trần", () => {
    const codes = COIN_QUEST_SEEDS.map((q) => q.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const q of COIN_QUEST_SEEDS) {
      expect(COIN_QUEST_METRICS).toContain(q.metric);
      expect(q.target).toBeLessThanOrEqual(LIMITS.coins.questTargetMax);
      expect(q.coins).toBeLessThanOrEqual(LIMITS.coins.questCoinsMax);
    }
  });

  it("vật phẩm: mã duy nhất, giá trong trần shop, data hợp lệ theo loại (đi qua đúng validator của admin)", () => {
    const codes = SHOP_ITEM_SEEDS.map((i) => i.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const i of SHOP_ITEM_SEEDS) {
      expect(i.price).toBeGreaterThanOrEqual(1);
      expect(i.price).toBeLessThanOrEqual(LIMITS.shop.priceMax);
      expect(checkShopItemData(i.kind, i.data)).toMatchObject({ ok: true });
    }
  });

  it("seedCoins idempotent: chỉ tạo phần còn thiếu, KHÔNG ghi đè bản admin đã sửa", async () => {
    const created = { rules: [] as unknown[], quests: [] as unknown[], items: [] as unknown[] };
    const existingRule = COIN_RULE_SEEDS[0]?.sourceType;
    const client = {
      coinRule: { findMany: () => Promise.resolve(existingRule ? [{ sourceType: existingRule }] : []), createMany: (a: { data: unknown[] }) => { created.rules.push(...a.data); return Promise.resolve({ count: a.data.length }); } },
      coinQuest: { findMany: () => Promise.resolve([]), createMany: (a: { data: unknown[] }) => { created.quests.push(...a.data); return Promise.resolve({ count: a.data.length }); } },
      shopItem: { findMany: () => Promise.resolve(SHOP_ITEM_SEEDS.map((i) => ({ code: i.code }))), createMany: (a: { data: unknown[] }) => { created.items.push(...a.data); return Promise.resolve({ count: a.data.length }); } },
    };
    const res = await seedCoins(client as never);
    expect(res).toEqual({ rules: COIN_RULE_SEEDS.length - 1, quests: COIN_QUEST_SEEDS.length, items: 0 });
    expect(created.items).toHaveLength(0);
    expect(created.rules.every((r) => (r as { sourceType: string }).sourceType !== existingRule)).toBe(true);
    expect(created.quests.every((q) => (q as { updatedBy: unknown }).updatedBy === null)).toBe(true);
  });
});
