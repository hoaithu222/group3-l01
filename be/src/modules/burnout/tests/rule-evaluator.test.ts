import fc from "fast-check";
import { DEFAULT_BURNOUT_RULE_SET, burnoutRuleSetSchema, type BurnoutRuleConfig } from "../../../core/constants/burnout";
import { addDaysToLocalDate } from "../../../core/utils/local-date";
import { checkRuleSet, levelOf, parseRuleSet, type BurnoutRuleSet } from "../domain/burnout-rules";
import { evaluateRules, suggestionOf, type WellbeingDay } from "../domain/rule-evaluator";

/**
 * Domain THUẦN: bộ chấm điểm theo luật (p7-03 be.md §5 "Evaluator", §10) — từng loại tổng hợp, `CONSECUTIVE_DAYS_OVER`, trần 100, mức biên 40/70, gợi ý; property: tất định, không phụ thuộc thứ tự, đơn điệu.
 */
const AS_OF = "2026-03-10";
const dateAgo = (n: number): string => addDaysToLocalDate(AS_OF, -n);
const ZERO = { activeMinutes: 0, longestContinuousMinutes: 0, lateNightMinutes: 0, eventsCount: 0, lateNightEvents: 0 };
const day = (ago: number, over: Partial<typeof ZERO> = {}): WellbeingDay => ({ date: dateAgo(ago), ...ZERO, ...over });
/** `n` ngày liên tiếp (asOf, asOf−1, …) cùng chỉ số. */
const days = (n: number, over: Partial<typeof ZERO> = {}): WellbeingDay[] => Array.from({ length: n }, (_, i) => day(i, over));

const rule = (over: Partial<BurnoutRuleConfig>): BurnoutRuleConfig => ({
  id: "r",
  label: "Luật thử",
  metric: "activeMinutes",
  aggregate: "MAX",
  days: 7,
  op: "GT",
  threshold: 100,
  points: 30,
  ...over,
});
const set = (rules: BurnoutRuleConfig[], over: Partial<BurnoutRuleSet> = {}): BurnoutRuleSet => ({ version: 1, windowDays: 7, levels: { medium: 40, high: 70 }, rules, ...over });

describe("bộ luật mặc định (README §7)", () => {
  it("đúng bốn luật, tổng điểm tối đa 100, qua schema", () => {
    expect(burnoutRuleSetSchema.safeParse(DEFAULT_BURNOUT_RULE_SET).success).toBe(true);
    expect(DEFAULT_BURNOUT_RULE_SET.rules.map((r) => [r.metric, r.aggregate, r.days, r.op, r.threshold, r.points])).toEqual([
      ["longestContinuousMinutes", "MAX", 7, "GT", 180, 30],
      ["lateNightEvents", "SUM", 7, "GT", 2, 30],
      ["activeMinutes", "AVG", 7, "GT", 600, 20],
      ["lateNightMinutes", "CONSECUTIVE_DAYS_OVER", 3, "GT", 60, 20],
    ]);
    expect(DEFAULT_BURNOUT_RULE_SET.rules.reduce((s, r) => s + r.points, 0)).toBe(100);
    expect(DEFAULT_BURNOUT_RULE_SET.levels).toEqual({ medium: 40, high: 70 });
    expect(checkRuleSet(DEFAULT_BURNOUT_RULE_SET)).toEqual([]);
  });

  it("người dùng bình thường → điểm 0, mức LOW, không nhân tố, không gợi ý", () => {
    const r = evaluateRules(DEFAULT_BURNOUT_RULE_SET, days(7, { activeMinutes: 120, longestContinuousMinutes: 60, eventsCount: 5 }), AS_OF);
    expect(r).toEqual({ riskScore: 0, level: "LOW", factors: [], suggestion: null });
  });

  it("làm liên tục ĐÚNG 180 phút không kích hoạt (GT), 195 thì có (+30 → LOW vì < 40)", () => {
    expect(evaluateRules(DEFAULT_BURNOUT_RULE_SET, [day(0, { longestContinuousMinutes: 180 })], AS_OF).factors).toEqual([]);
    const r = evaluateRules(DEFAULT_BURNOUT_RULE_SET, [day(2, { longestContinuousMinutes: 195 })], AS_OF);
    expect(r.factors.map((f) => [f.ruleId, f.value, f.points])).toEqual([["long-continuous-session", 195, 30]]);
    expect(r).toMatchObject({ riskScore: 30, level: "LOW", suggestion: "BREAK" });
  });

  it("hoạt động khuya: tổng 7 ngày > 2 sự kiện mới tính (2 → không, 3 → có)", () => {
    expect(evaluateRules(DEFAULT_BURNOUT_RULE_SET, [day(0, { lateNightEvents: 1 }), day(1, { lateNightEvents: 1 })], AS_OF).factors).toEqual([]);
    const r = evaluateRules(DEFAULT_BURNOUT_RULE_SET, [day(0, { lateNightEvents: 1 }), day(3, { lateNightEvents: 2 })], AS_OF);
    expect(r.factors.map((f) => [f.ruleId, f.value])).toEqual([["late-night-events", 3]]);
    expect(r.suggestion).toBe("SLEEP");
  });

  it("trung bình hoạt động 7 ngày > 600: chỉ tính NGÀY CÓ DỮ LIỆU (ngày chưa bật/lỡ nhịp không kéo trung bình xuống)", () => {
    const r = evaluateRules(DEFAULT_BURNOUT_RULE_SET, [day(0, { activeMinutes: 660 }), day(1, { activeMinutes: 645 }), day(2, { activeMinutes: 615 })], AS_OF);
    expect(r.factors).toHaveLength(1);
    expect(r.factors[0]).toMatchObject({ ruleId: "high-daily-activity", value: 640 });
    expect(r.suggestion).toBe("SPREAD_TASKS");
  });

  it("khuya 3 ngày liên tiếp > 60 phút: đủ 3 ngày liền tới asOf mới tính; thiếu 1 ngày ở giữa hoặc 1 ngày không vượt làm đứt chuỗi", () => {
    const ok = evaluateRules(DEFAULT_BURNOUT_RULE_SET, days(3, { lateNightMinutes: 75 }), AS_OF);
    expect(ok.factors.map((f) => [f.ruleId, f.value])).toEqual([["late-night-streak", 3]]);
    const broken = evaluateRules(DEFAULT_BURNOUT_RULE_SET, [day(0, { lateNightMinutes: 75 }), day(2, { lateNightMinutes: 75 }), day(3, { lateNightMinutes: 75 })], AS_OF);
    expect(broken.factors).toEqual([]);
    const weak = evaluateRules(DEFAULT_BURNOUT_RULE_SET, [day(0, { lateNightMinutes: 75 }), day(1, { lateNightMinutes: 60 }), day(2, { lateNightMinutes: 75 })], AS_OF);
    expect(weak.factors).toEqual([]);
  });

  it("ngày chấm khác `asOf`: chuỗi tính lùi từ asOf, không từ ngày mới nhất có dữ liệu", () => {
    const lateStreak = days(3, { lateNightMinutes: 90 }).map((d) => ({ ...d, date: addDaysToLocalDate(d.date, -1) })); // asOf−1..asOf−3
    expect(evaluateRules(DEFAULT_BURNOUT_RULE_SET, lateStreak, AS_OF).factors).toEqual([]);
  });

  it("thoả cả bốn luật → 100 điểm, mức HIGH, gợi ý theo nhân tố nặng nhất (hoà điểm → luật đứng trước)", () => {
    const r = evaluateRules(DEFAULT_BURNOUT_RULE_SET, days(7, { activeMinutes: 700, longestContinuousMinutes: 240, lateNightMinutes: 120, lateNightEvents: 2 }), AS_OF);
    expect(r.factors.map((f) => f.ruleId)).toEqual(["long-continuous-session", "late-night-events", "high-daily-activity", "late-night-streak"]);
    expect(r).toMatchObject({ riskScore: 100, level: "HIGH", suggestion: "BREAK" });
  });

  it("ngày ngoài cửa sổ 7 ngày không được tính", () => {
    expect(evaluateRules(DEFAULT_BURNOUT_RULE_SET, [day(7, { longestContinuousMinutes: 600 })], AS_OF).factors).toEqual([]);
    expect(evaluateRules(DEFAULT_BURNOUT_RULE_SET, [day(6, { longestContinuousMinutes: 600 })], AS_OF).factors).toHaveLength(1);
  });

  it("không có ngày nào → không luật nào kích hoạt", () => {
    expect(evaluateRules(DEFAULT_BURNOUT_RULE_SET, [], AS_OF)).toEqual({ riskScore: 0, level: "LOW", factors: [], suggestion: null });
  });
});

describe("mức LOW/MEDIUM/HIGH — biên 40/70 và trần 100", () => {
  it.each([
    [0, "LOW"],
    [39, "LOW"],
    [40, "MEDIUM"],
    [69, "MEDIUM"],
    [70, "HIGH"],
    [100, "HIGH"],
  ] as const)("điểm %d → %s", (score, level) => {
    expect(levelOf(score, { medium: 40, high: 70 })).toBe(level);
  });

  it("chấm bằng luật tự tạo: 39 → LOW, 40 → MEDIUM, 69 → MEDIUM, 70 → HIGH", () => {
    const at = (points: number) => evaluateRules(set([rule({ points })]), [day(0, { activeMinutes: 500 })], AS_OF);
    expect([at(39).level, at(40).level, at(69).level, at(70).level]).toEqual(["LOW", "MEDIUM", "MEDIUM", "HIGH"]);
  });

  it("tổng điểm các luật kích hoạt bị chặn ở 100", () => {
    const rules = [rule({ id: "a", points: 60 }), rule({ id: "b", points: 60 }), rule({ id: "c", points: 60 })];
    expect(evaluateRules(set(rules), [day(0, { activeMinutes: 500 })], AS_OF)).toMatchObject({ riskScore: 100, level: "HIGH" });
  });

  it("GTE khác GT ở đúng ngưỡng", () => {
    const d = [day(0, { activeMinutes: 100 })];
    expect(evaluateRules(set([rule({ op: "GT" })]), d, AS_OF).factors).toHaveLength(0);
    expect(evaluateRules(set([rule({ op: "GTE" })]), d, AS_OF).factors).toHaveLength(1);
  });

  it("SUM và AVG khác nhau; `days` của luật hẹp hơn cửa sổ", () => {
    const d = [day(0, { eventsCount: 3 }), day(1, { eventsCount: 3 }), day(5, { eventsCount: 30 })];
    const sum = evaluateRules(set([rule({ metric: "eventsCount", aggregate: "SUM", days: 2, threshold: 5 })]), d, AS_OF);
    expect(sum.factors[0]?.value).toBe(6);
    const avg = evaluateRules(set([rule({ metric: "eventsCount", aggregate: "AVG", days: 7, threshold: 5 })]), d, AS_OF);
    expect(avg.factors[0]?.value).toBe(12);
  });
});

describe("suggestionOf", () => {
  it("khuya → SLEEP, liên tục → BREAK, dày → SPREAD_TASKS, không nhân tố → null; nặng nhất thắng", () => {
    expect(suggestionOf([])).toBeNull();
    expect(suggestionOf([{ metric: "lateNightMinutes", points: 20 }])).toBe("SLEEP");
    expect(suggestionOf([{ metric: "activeMinutes", points: 20 }])).toBe("SPREAD_TASKS");
    expect(suggestionOf([{ metric: "eventsCount", points: 5 }])).toBe("SPREAD_TASKS");
    expect(suggestionOf([{ metric: "longestContinuousMinutes", points: 30 }, { metric: "lateNightEvents", points: 30 }])).toBe("BREAK");
    expect(suggestionOf([{ metric: "longestContinuousMinutes", points: 20 }, { metric: "lateNightEvents", points: 30 }])).toBe("SLEEP");
  });
});

describe("checkRuleSet / parseRuleSet", () => {
  it("medium ≥ high, mã luật trùng, luật nhìn xa hơn cửa sổ đều bị báo", () => {
    const issues = checkRuleSet(set([rule({ id: "a" }), rule({ id: "a" }), rule({ id: "b", days: 10 })], { levels: { medium: 50, high: 50 } }));
    expect(issues.map((i) => i.code).sort()).toEqual(["DUPLICATE_RULE_ID", "LEVELS_ORDER", "RULE_DAYS_EXCEED_WINDOW"]);
  });

  it("parseRuleSet: hợp lệ giữ nguyên; sai hình dạng hoặc sai ràng buộc chéo → dùng mặc định (không ném lỗi)", () => {
    const custom = set([rule({ id: "x", points: 45 })], { version: 3 });
    expect(parseRuleSet(custom)).toEqual({ ruleSet: custom, usedDefault: false });
    for (const bad of [null, undefined, "x", { version: 1 }, set([rule({})], { levels: { medium: 80, high: 60 } }), set([rule({ days: 9 })])]) {
      expect(parseRuleSet(bad)).toEqual({ ruleSet: DEFAULT_BURNOUT_RULE_SET, usedDefault: true });
    }
  });
});

describe("property — tất định, không phụ thuộc thứ tự, đơn điệu", () => {
  const dayArb = fc.record({
    ago: fc.integer({ min: 0, max: 9 }),
    activeMinutes: fc.integer({ min: 0, max: 1440 }),
    longestContinuousMinutes: fc.integer({ min: 0, max: 1440 }),
    lateNightMinutes: fc.integer({ min: 0, max: 360 }),
    eventsCount: fc.integer({ min: 0, max: 200 }),
    lateNightEvents: fc.integer({ min: 0, max: 50 }),
  });
  const toDays = (rows: Array<{ ago: number } & typeof ZERO>): WellbeingDay[] => rows.map(({ ago, ...m }) => ({ date: dateAgo(ago), ...m }));

  it("0 ≤ điểm ≤ 100; điểm = min(100, Σ điểm nhân tố); mức khớp điểm", () => {
    fc.assert(
      fc.property(fc.array(dayArb, { maxLength: 12 }), (rows) => {
        const r = evaluateRules(DEFAULT_BURNOUT_RULE_SET, toDays(rows), AS_OF);
        expect(r.riskScore).toBeGreaterThanOrEqual(0);
        expect(r.riskScore).toBeLessThanOrEqual(100);
        expect(r.riskScore).toBe(Math.min(100, r.factors.reduce((s, f) => s + f.points, 0)));
        expect(r.level).toBe(levelOf(r.riskScore, DEFAULT_BURNOUT_RULE_SET.levels));
      })
    );
  });

  it("không phụ thuộc thứ tự các ngày truyền vào", () => {
    fc.assert(
      fc.property(fc.array(dayArb, { maxLength: 12 }), (rows) => {
        // Cùng một ngày lặp nhiều hàng: hàng CUỐI thắng, nên chỉ so khi mỗi ngày một hàng.
        const unique = [...new Map(rows.map((r) => [r.ago, r])).values()];
        expect(evaluateRules(DEFAULT_BURNOUT_RULE_SET, toDays([...unique].reverse()), AS_OF)).toEqual(evaluateRules(DEFAULT_BURNOUT_RULE_SET, toDays(unique), AS_OF));
      })
    );
  });

  it("tăng MỌI chỉ số của mọi ngày không bao giờ làm giảm điểm", () => {
    fc.assert(
      fc.property(fc.array(dayArb, { maxLength: 12 }), fc.integer({ min: 0, max: 300 }), (rows, extra) => {
        const base = evaluateRules(DEFAULT_BURNOUT_RULE_SET, toDays(rows), AS_OF).riskScore;
        const bumped = rows.map((r) => ({ ...r, activeMinutes: r.activeMinutes + extra, longestContinuousMinutes: r.longestContinuousMinutes + extra, lateNightMinutes: r.lateNightMinutes + extra, eventsCount: r.eventsCount + extra, lateNightEvents: r.lateNightEvents + extra }));
        expect(evaluateRules(DEFAULT_BURNOUT_RULE_SET, toDays(bumped), AS_OF).riskScore).toBeGreaterThanOrEqual(base);
      })
    );
  });

  it("nâng ngưỡng của mọi luật không bao giờ làm tăng điểm", () => {
    fc.assert(
      fc.property(fc.array(dayArb, { maxLength: 12 }), fc.integer({ min: 0, max: 500 }), (rows, extra) => {
        const stricter: BurnoutRuleSet = { ...DEFAULT_BURNOUT_RULE_SET, rules: DEFAULT_BURNOUT_RULE_SET.rules.map((r) => ({ ...r, threshold: r.threshold + extra })) };
        expect(evaluateRules(stricter, toDays(rows), AS_OF).riskScore).toBeLessThanOrEqual(evaluateRules(DEFAULT_BURNOUT_RULE_SET, toDays(rows), AS_OF).riskScore);
      })
    );
  });
});
