/**
 * Unit — khoá registry thêm cho p4-01 (`limits.study`), p6-03 (`mentor`) và p6-04 (`wallet`): trần/mặc định khớp `LIMITS`, schema PUT, `RuntimeConfigService`
 * clamp giá trị đã lưu ngoài khoảng, đường dẫn `<khoá>.<field>` đọc được bằng `runtimeConfig.get` (hàm tách khoá ở dấu chấm ĐẦU nên khoá nhóm là đơn đoạn).
 */
import { LIMITS } from "../../constants/limits";
import { parseWeeklyCron } from "../../../modules/wallet/domain/wallet-schedule";
import { weeklyCronSchema } from "../../../modules/wallet/dtos/money.schemas";
import { systemConfigKeyParamSchema } from "../../../modules/system-config/dtos/update-system-config.dto";
import { get, getEffective, initRuntimeConfig, resetRuntimeConfig, type ISystemConfigReader, type SystemConfigSnapshot } from "../runtime-config";
import { SYSTEM_CONFIG_REGISTRY, WALLET_WEEKLY_CRON_RE } from "../system-config.registry";

const reader = (data: Record<string, SystemConfigSnapshot>): ISystemConfigReader => ({ findByKey: (key) => Promise.resolve(data[key] ?? null) });
const field = (key: string, path: string) => SYSTEM_CONFIG_REGISTRY[key]!.fields.find((f) => f.path === path)!;
const ceilOf = (f: { ceil?: number | (() => number) }) => (typeof f.ceil === "function" ? f.ceil() : f.ceil);

describe("khoá registry `limits.study` (p4-01 admin.md §2.2)", () => {
  const def = SYSTEM_CONFIG_REGISTRY["limits.study"]!;
  afterEach(() => resetRuntimeConfig());

  it("nằm ở tab limits, khoá 2 đoạn hợp lệ với route admin, chỉ đọc runtime (không vào capabilities)", () => {
    expect(def).toMatchObject({ key: "limits.study", tab: "limits", affects: ["runtime"] });
    expect(systemConfigKeyParamSchema.safeParse({ key: "limits.study" }).success).toBe(true);
    expect(def.fields.map((f) => f.path)).toEqual(["itemsPerSetMax", "setsPerUserMax", "optionsMax"]);
  });

  it("mặc định = LIMITS.study; trần = trần cứng LIMITS.study (admin chỉ HẠ được); sàn hợp lý", () => {
    expect(field("limits.study", "itemsPerSetMax")).toMatchObject({ default: LIMITS.study.itemsPerSetMax, floor: 10, ceil: LIMITS.study.itemsPerSetMax, kind: "int" });
    expect(field("limits.study", "setsPerUserMax")).toMatchObject({ default: LIMITS.study.setsPerUserMax, floor: 1, ceil: LIMITS.study.setsPerUserMax });
    expect(field("limits.study", "optionsMax")).toMatchObject({ default: LIMITS.study.optionsMax, floor: LIMITS.study.optionsMin, ceil: LIMITS.study.optionsMax });
    for (const f of def.fields) {
      expect(f.default as number).toBeGreaterThanOrEqual(f.floor!);
      expect(f.default as number).toBeLessThanOrEqual(ceilOf(f)!);
    }
  });

  it("schema PUT: chỉ số nguyên, khoá lạ (vd dung lượng ảnh — không chỉnh runtime được) bị bỏ", () => {
    expect(def.schema.safeParse({ itemsPerSetMax: 100, setsPerUserMax: 50, optionsMax: 4 }).success).toBe(true);
    expect(def.schema.safeParse({ itemsPerSetMax: 100.5 }).success).toBe(false);
    expect(def.schema.safeParse({ optionsMax: "4" }).success).toBe(false);
    expect(Object.keys(def.schema.parse({ itemsPerSetMax: 100, imageMaxBytes: 1 }))).toEqual(["itemsPerSetMax"]);
  });

  it("getEffective: mặc định khi chưa lưu; giá trị đã lưu ngoài khoảng bị clamp âm thầm", async () => {
    initRuntimeConfig(reader({}));
    expect(await getEffective("limits.study")).toEqual({ itemsPerSetMax: LIMITS.study.itemsPerSetMax, setsPerUserMax: LIMITS.study.setsPerUserMax, optionsMax: LIMITS.study.optionsMax });
    resetRuntimeConfig();
    initRuntimeConfig(reader({ "limits.study": { value: { itemsPerSetMax: 99_999, setsPerUserMax: 0, optionsMax: 1 }, version: 2 } }));
    expect(await getEffective("limits.study")).toEqual({ itemsPerSetMax: LIMITS.study.itemsPerSetMax, setsPerUserMax: 1, optionsMax: LIMITS.study.optionsMin });
  });
});

describe("khoá registry `mentor` (p6-03 README §7 — mentor.defaultDurationDays)", () => {
  const def = SYSTEM_CONFIG_REGISTRY.mentor!;
  afterEach(() => resetRuntimeConfig());

  it("khoá nhóm đơn đoạn, field defaultDurationDays: mặc định 30, [7, 60] theo LIMITS.mentor.durationDays, đơn vị ngày", () => {
    expect(def).toMatchObject({ key: "mentor", tab: "limits", affects: ["runtime"] });
    expect(systemConfigKeyParamSchema.safeParse({ key: "mentor" }).success).toBe(true);
    expect(field("mentor", "defaultDurationDays")).toMatchObject({
      kind: "int",
      unit: "days",
      default: LIMITS.mentor.durationDays.default,
      floor: LIMITS.mentor.durationDays.min,
      ceil: LIMITS.mentor.durationDays.max,
    });
    expect([LIMITS.mentor.durationDays.default, LIMITS.mentor.durationDays.min, LIMITS.mentor.durationDays.max]).toEqual([30, 7, 60]);
  });

  it("schema PUT chỉ nhận số nguyên; `runtimeConfig.get('mentor.defaultDurationDays')` trả mặc định / giá trị đã lưu / giá trị đã clamp", async () => {
    expect(def.schema.safeParse({ defaultDurationDays: 45 }).success).toBe(true);
    expect(def.schema.safeParse({ defaultDurationDays: 45.5 }).success).toBe(false);
    expect(def.schema.safeParse({ defaultDurationDays: "45" }).success).toBe(false);

    initRuntimeConfig(reader({}));
    expect(await get("mentor.defaultDurationDays")).toBe(30);
    resetRuntimeConfig();
    initRuntimeConfig(reader({ mentor: { value: { defaultDurationDays: 45 }, version: 1 } }));
    expect(await get("mentor.defaultDurationDays")).toBe(45);
    resetRuntimeConfig();
    initRuntimeConfig(reader({ mentor: { value: { defaultDurationDays: 500 }, version: 2 } }));
    expect(await get("mentor.defaultDurationDays")).toBe(60);
    resetRuntimeConfig();
    initRuntimeConfig(reader({ mentor: { value: { defaultDurationDays: 1 }, version: 3 } }));
    expect(await get("mentor.defaultDurationDays")).toBe(7);
  });
});

describe("khoá registry `wallet` (p6-04 README §7 — wallet.defaultReminderCron / wallet.defaultTz)", () => {
  const def = SYSTEM_CONFIG_REGISTRY.wallet!;
  afterEach(() => resetRuntimeConfig());

  it("khoá nhóm đơn đoạn; mặc định khớp LIMITS.wallet; options là gợi ý và chứa mặc định", () => {
    expect(def).toMatchObject({ key: "wallet", tab: "limits", affects: ["runtime"] });
    expect(systemConfigKeyParamSchema.safeParse({ key: "wallet" }).success).toBe(true);
    const cron = field("wallet", "defaultReminderCron");
    const tz = field("wallet", "defaultTz");
    expect(cron).toMatchObject({ kind: "enum", default: LIMITS.wallet.defaultReminderCron });
    expect(tz).toMatchObject({ kind: "enum", default: LIMITS.wallet.defaultTz });
    expect(cron.options).toContain(LIMITS.wallet.defaultReminderCron);
    expect(tz.options).toContain(LIMITS.wallet.defaultTz);
    for (const option of cron.options!) expect(parseWeeklyCron(option)).not.toBeNull();
  });

  it("schema PUT: nhận mọi lịch hằng tuần + múi giờ IANA hợp lệ (kể cả ngoài gợi ý); từ chối lịch/múi giờ sai", () => {
    expect(def.schema.safeParse({ defaultReminderCron: "30 20 * * 3", defaultTz: "Asia/Dubai" }).success).toBe(true);
    expect(def.schema.parse({ defaultReminderCron: "  0 9 * * 5  " })).toEqual({ defaultReminderCron: "0 9 * * 5" });
    for (const bad of ["0 9 * * 7", "60 9 * * 5", "0 24 * * 5", "0 9 1 * 5", "*/5 * * * *", "0 9 * * *", ""]) {
      expect(def.schema.safeParse({ defaultReminderCron: bad }).success).toBe(false);
    }
    for (const bad of ["Mars/Olympus", "", "GMT+7x"]) expect(def.schema.safeParse({ defaultTz: bad }).success).toBe(false);
  });

  it("regex của registry KHỚP `weeklyCronSchema` + `parseWeeklyCron` của module wallet (core không import module nên có hai bản)", () => {
    const samples = ["0 9 * * 5", "00 09 * * 5", "5 9 * * 0", "59 23 * * 6", "0 9 * * 7", "60 9 * * 1", "0 25 * * 1", "0 9 * 1 5", "0 9 * * *", "a b c d e", "0 9 * * 5 ", " 0 9 * * 5"];
    for (const cron of samples) {
      const registry = WALLET_WEEKLY_CRON_RE.test(cron.trim());
      expect(registry).toBe(weeklyCronSchema.safeParse(cron).success);
      expect(registry).toBe(parseWeeklyCron(cron) !== null);
    }
  });

  it("`runtimeConfig.get('wallet.defaultTz'|'wallet.defaultReminderCron')`: mặc định khi chưa lưu, giá trị đã lưu khi có", async () => {
    initRuntimeConfig(reader({}));
    expect(await get("wallet.defaultTz")).toBe(LIMITS.wallet.defaultTz);
    expect(await get("wallet.defaultReminderCron")).toBe(LIMITS.wallet.defaultReminderCron);
    resetRuntimeConfig();
    initRuntimeConfig(reader({ wallet: { value: { defaultTz: "Asia/Bangkok", defaultReminderCron: "0 18 * * 5" }, version: 1 } }));
    expect(await get("wallet.defaultTz")).toBe("Asia/Bangkok");
    expect(await get("wallet.defaultReminderCron")).toBe("0 18 * * 5");
  });
});
