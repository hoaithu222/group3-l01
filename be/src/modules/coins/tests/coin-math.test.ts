import { xpDedupeKey } from "../../gamification/services/xp-source-mapper";
import { awardWithCaps, earnDedupeKey, isCoinSource, isValidAmount, QUEST_METRIC_BY_SOURCE, questRefId, walletDeltaOf, xpRefId } from "../domain/coin-math";
import { COIN_QUEST_METRICS, COIN_SOURCE_TYPES, COIN_TX_TYPES, type CoinTxTypeValue } from "../entities/coins.interface";

describe("isValidAmount — dấu hợp lệ theo loại giao dịch", () => {
  it.each<[CoinTxTypeValue, number, boolean]>([
    ["EARN_EVENT", 5, true],
    ["EARN_EVENT", -5, false],
    ["EARN_QUEST", 1, true],
    ["EARN_SALE", 9, true],
    ["EARN_SALE", -9, false],
    ["SPEND_SHOP", -100, true],
    ["SPEND_SHOP", 100, false],
    ["SPEND_MARKETPLACE", -1, true],
    ["BURN_FEE", -1, true],
    ["BURN_FEE", 1, false],
    ["REFUND", 10, true],
    ["REFUND", -10, true],
    ["ADJUST_ADMIN", 500, true],
    ["ADJUST_ADMIN", -500, true],
  ])("%s với %d → %s", (type, amount, expected) => {
    expect(isValidAmount(type, amount)).toBe(expected);
  });

  it("số 0, số thực, NaN, vô hạn, ngoài dải số nguyên an toàn đều bị từ chối ở MỌI loại", () => {
    for (const type of COIN_TX_TYPES) {
      for (const bad of [0, 1.5, -1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 2]) expect(isValidAmount(type, bad)).toBe(false);
    }
  });
});

describe("walletDeltaOf — hệ số cập nhật ví", () => {
  it("nhận: cộng số dư + tổng đã nhận", () => {
    expect(walletDeltaOf("EARN_EVENT", 7)).toEqual({ balance: 7, earned: 7, spent: 0 });
    expect(walletDeltaOf("EARN_QUEST", 7)).toEqual({ balance: 7, earned: 7, spent: 0 });
  });

  it("tiêu/đốt phí: trừ số dư + cộng tổng đã tiêu (dương)", () => {
    expect(walletDeltaOf("SPEND_SHOP", -120)).toEqual({ balance: -120, earned: 0, spent: 120 });
    expect(walletDeltaOf("BURN_FEE", -3)).toEqual({ balance: -3, earned: 0, spent: 3 });
  });

  it("hoàn xu (+) giảm 'đã tiêu'; thu hồi (−) giảm 'đã nhận'", () => {
    expect(walletDeltaOf("REFUND", 50)).toEqual({ balance: 50, earned: 0, spent: -50 });
    expect(walletDeltaOf("REFUND", -50)).toEqual({ balance: -50, earned: -50, spent: 0 });
  });

  it("điều chỉnh của admin KHÔNG tính vào đã nhận/đã tiêu (số liệu người dùng thấy phản ánh hoạt động thật)", () => {
    expect(walletDeltaOf("ADJUST_ADMIN", 1000)).toEqual({ balance: 1000, earned: 0, spent: 0 });
    expect(walletDeltaOf("ADJUST_ADMIN", -1000)).toEqual({ balance: -1000, earned: 0, spent: 0 });
  });
});

describe("awardWithCaps — trần ngày", () => {
  const base = { ruleCoins: 10, ruleDailyCap: null, earnedRuleToday: 0, earnedToday: 0, globalCap: 200 };

  it("chưa chạm trần: nhận đủ", () => {
    expect(awardWithCaps(base)).toEqual({ allowed: 10, capped: false });
  });

  it("trần luật còn 4 → chỉ nhận 4 và capped", () => {
    expect(awardWithCaps({ ...base, ruleDailyCap: 30, earnedRuleToday: 26 })).toEqual({ allowed: 4, capped: true });
  });

  it("trần chung còn 3 → chỉ nhận 3 (lấy trần THẤP hơn trong hai trần)", () => {
    expect(awardWithCaps({ ...base, ruleDailyCap: 30, earnedRuleToday: 0, earnedToday: 197 })).toEqual({ allowed: 3, capped: true });
  });

  it("đã hết trần (kể cả vượt do admin hạ trần): 0, không bao giờ âm", () => {
    expect(awardWithCaps({ ...base, earnedToday: 200 })).toEqual({ allowed: 0, capped: true });
    expect(awardWithCaps({ ...base, earnedToday: 500 })).toEqual({ allowed: 0, capped: true });
    expect(awardWithCaps({ ...base, globalCap: 0 })).toEqual({ allowed: 0, capped: true });
  });
});

describe("nguồn XP và chỉ số nhiệm vụ", () => {
  it("ADMIN_ADJUST KHÔNG phải nguồn thưởng xu (admin cộng XP tay không đẻ ra xu)", () => {
    expect(isCoinSource("ADMIN_ADJUST")).toBe(false);
    expect(isCoinSource("KHONG_TON_TAI")).toBe(false);
    expect(COIN_SOURCE_TYPES).not.toContain("ADMIN_ADJUST");
  });

  it("mọi nguồn có chỉ số nhiệm vụ đều nằm trong whitelist chỉ số; SR_REVIEW (XP 0, không phát xp.awarded) không có chỉ số", () => {
    for (const metric of Object.values(QUEST_METRIC_BY_SOURCE)) expect(COIN_QUEST_METRICS).toContain(metric);
    expect(QUEST_METRIC_BY_SOURCE.SR_REVIEW).toBeUndefined();
  });

  it("mọi chỉ số whitelist đều có ít nhất một nguồn cấp tiến độ (không có nhiệm vụ mồ côi không bao giờ hoàn thành)", () => {
    const covered = new Set(Object.values(QUEST_METRIC_BY_SOURCE));
    for (const metric of COIN_QUEST_METRICS) expect(covered.has(metric)).toBe(true);
  });
});

describe("khoá tham chiếu", () => {
  it("earnDedupeKey KHỚP xpDedupeKey của gamification (cùng một khoá idempotent với XpEvent)", () => {
    const input = { sourceType: "TASK_COMPLETED", sourceId: "6512ab", userId: "u1" } as const;
    expect(earnDedupeKey(input.sourceType, input.sourceId, input.userId)).toBe(xpDedupeKey(input));
  });

  it("refId sổ cái: sự kiện `<sourceType>:<sourceId>`, nhiệm vụ `<questId>:<ngày>`", () => {
    expect(xpRefId("QUIZ_PASSED", "att1")).toBe("QUIZ_PASSED:att1");
    expect(questRefId("q1", "2026-03-10")).toBe("q1:2026-03-10");
  });
});
