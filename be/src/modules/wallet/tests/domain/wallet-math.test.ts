import {
  splitExpense,
  computeBalances,
  minCashFlow,
  projectShares,
  isSplitTotalValid,
  type Share,
  type SplitParticipant,
} from "../../domain/wallet-math";
import { generateSettlementCode, isValidSettlementCode } from "../../domain/vietqr-reference";

const day = (d: number): Date => new Date(Date.UTC(2026, 8, d));

describe("splitExpense", () => {
  const ids = ["A", "B", "C", "D"];

  it("IR-03: 150.000 chia đều 4 người (gồm người trả) → 3 share 37.500, người trả không nợ", () => {
    const shares = splitExpense({
      amount: 150_000,
      splitType: "EQUAL",
      participants: ids.map((userId) => ({ userId })),
      paidBy: "A",
    });
    expect(shares).toEqual([
      { debtorId: "B", creditorId: "A", amount: 37_500 },
      { debtorId: "C", creditorId: "A", amount: 37_500 },
      { debtorId: "D", creditorId: "A", amount: 37_500 },
    ]);
  });

  it("IR-03: phần lẻ do người trả chịu (100.003 / 4 → 25.000 × 3, người trả gánh 25.003)", () => {
    const shares = splitExpense({
      amount: 100_003,
      splitType: "EQUAL",
      participants: ids.map((userId) => ({ userId })),
      paidBy: "A",
    });
    expect(shares.map((s) => s.amount)).toEqual([25_000, 25_000, 25_000]);
    const owedToPayer = shares.reduce((s, x) => s + x.amount, 0);
    expect(100_003 - owedToPayer).toBe(25_003);
  });

  it("IR-31: 100.000 chia 3 người KHÔNG gồm người trả → 33.333 × 3, người trả được nợ 99.999", () => {
    const shares = splitExpense({
      amount: 100_000,
      splitType: "EQUAL",
      participants: [{ userId: "B" }, { userId: "C" }, { userId: "D" }],
      paidBy: "A",
    });
    expect(shares.map((s) => s.amount)).toEqual([33_333, 33_333, 33_333]);
    const balances = computeBalances(shares, []);
    expect(balances.get("A")).toBe(99_999);
  });

  it("amount nhỏ hơn số người → không sinh share (mọi phần = 0)", () => {
    const shares = splitExpense({ amount: 2, splitType: "EQUAL", participants: [{ userId: "B" }, { userId: "C" }, { userId: "D" }], paidBy: "A" });
    expect(shares).toEqual([]);
  });

  it("PERCENT: floor theo bps, người trả tự chịu phần mình và phần dư", () => {
    const participants: SplitParticipant[] = [
      { userId: "A", bps: 5000 },
      { userId: "B", bps: 3333 },
      { userId: "C", bps: 1667 },
    ];
    const shares = splitExpense({ amount: 100_001, splitType: "PERCENT", participants, paidBy: "A" });
    expect(shares).toEqual([
      { debtorId: "B", creditorId: "A", amount: Math.floor((100_001 * 3333) / 10_000) },
      { debtorId: "C", creditorId: "A", amount: Math.floor((100_001 * 1667) / 10_000) },
    ]);
  });

  it("CUSTOM: đúng số tiền từng người, bỏ phần người trả và phần 0", () => {
    const shares = splitExpense({
      amount: 90_000,
      splitType: "CUSTOM",
      participants: [
        { userId: "A", amount: 30_000 },
        { userId: "B", amount: 60_000 },
        { userId: "C", amount: 0 },
      ],
      paidBy: "A",
    });
    expect(shares).toEqual([{ debtorId: "B", creditorId: "A", amount: 60_000 }]);
  });

  it("người trả không nằm trong danh sách: mọi participant đều nợ người trả", () => {
    const shares = splitExpense({ amount: 60_000, splitType: "EQUAL", participants: [{ userId: "B" }, { userId: "C" }], paidBy: "A" });
    expect(shares.map((s) => s.amount)).toEqual([30_000, 30_000]);
  });

  it("kết quả tất định: thứ tự participant đầu vào không đổi thứ tự share", () => {
    const a = splitExpense({ amount: 9_000, splitType: "EQUAL", participants: [{ userId: "D" }, { userId: "B" }, { userId: "C" }], paidBy: "A" });
    const b = splitExpense({ amount: 9_000, splitType: "EQUAL", participants: [{ userId: "B" }, { userId: "C" }, { userId: "D" }], paidBy: "A" });
    expect(a).toEqual(b);
  });
});

describe("isSplitTotalValid (WALLET_002)", () => {
  it("CUSTOM: tổng phải bằng amount", () => {
    expect(isSplitTotalValid({ amount: 100, splitType: "CUSTOM", paidBy: "A", participants: [{ userId: "A", amount: 40 }, { userId: "B", amount: 60 }] })).toBe(true);
    expect(isSplitTotalValid({ amount: 100, splitType: "CUSTOM", paidBy: "A", participants: [{ userId: "A", amount: 40 }, { userId: "B", amount: 59 }] })).toBe(false);
  });

  it("PERCENT: tổng bps phải bằng 10000", () => {
    expect(isSplitTotalValid({ amount: 1, splitType: "PERCENT", paidBy: "A", participants: [{ userId: "A", bps: 9999 }] })).toBe(false);
    expect(isSplitTotalValid({ amount: 1, splitType: "PERCENT", paidBy: "A", participants: [{ userId: "A", bps: 4000 }, { userId: "B", bps: 6000 }] })).toBe(true);
  });

  it("EQUAL: chỉ cần có người tham gia", () => {
    expect(isSplitTotalValid({ amount: 1, splitType: "EQUAL", paidBy: "A", participants: [] })).toBe(false);
    expect(isSplitTotalValid({ amount: 1, splitType: "EQUAL", paidBy: "A", participants: [{ userId: "B" }] })).toBe(true);
  });
});

describe("computeBalances + minCashFlow", () => {
  it("IR-04: A nợ B 50k, B nợ C 50k → gợi ý A → C 50k, số dư B = 0", () => {
    const shares: Share[] = [
      { debtorId: "A", creditorId: "B", amount: 50_000 },
      { debtorId: "B", creditorId: "C", amount: 50_000 },
    ];
    const balances = computeBalances(shares, []);
    expect(balances.get("A")).toBe(-50_000);
    expect(balances.get("B")).toBe(0);
    expect(balances.get("C")).toBe(50_000);
    expect(minCashFlow(balances)).toEqual([{ fromId: "A", toId: "C", amount: 50_000 }]);
  });

  it("settlement CONFIRMED làm số dư về 0 (IR-32)", () => {
    const shares: Share[] = [
      { debtorId: "A", creditorId: "B", amount: 50_000 },
      { debtorId: "B", creditorId: "C", amount: 50_000 },
    ];
    const balances = computeBalances(shares, [{ fromId: "A", toId: "C", amount: 50_000 }]);
    expect([...balances.values()].every((v) => v === 0)).toBe(true);
    expect(minCashFlow(balances)).toEqual([]);
  });

  it("ghép người nợ lớn nhất với người được nợ lớn nhất, dư tiếp tục ghép", () => {
    const suggestions = minCashFlow({ A: -70, B: -30, C: 60, D: 40 });
    // Bước 1: A(70)↔C(60) → A còn 10. Bước 2: B(30) lớn hơn A(10) nên ghép với D(40). Bước 3: A(10)→D(10).
    expect(suggestions).toEqual([
      { fromId: "A", toId: "C", amount: 60 },
      { fromId: "B", toId: "D", amount: 30 },
      { fromId: "A", toId: "D", amount: 10 },
    ]);
  });

  it("tie-break theo userId để kết quả tất định", () => {
    const one = minCashFlow({ B: -10, A: -10, C: 20 });
    const two = minCashFlow({ A: -10, C: 20, B: -10 });
    expect(one).toEqual(two);
    expect(one[0].fromId).toBe("A");
  });

  it("số dư toàn 0 hoặc rỗng → không có gợi ý", () => {
    expect(minCashFlow({})).toEqual([]);
    expect(minCashFlow({ A: 0, B: 0 })).toEqual([]);
  });

  it("người 0 dư không xuất hiện trong gợi ý; 1 chủ nợ nhiều con nợ", () => {
    const s = minCashFlow({ A: 0, B: -5, C: -5, D: 10 });
    expect(s.map((x) => x.toId)).toEqual(["D", "D"]);
    expect(s.reduce((sum, x) => sum + x.amount, 0)).toBe(10);
  });
});

describe("projectShares (phép chiếu FIFO)", () => {
  const shares = [
    { id: "s2", amount: 30_000, occurredAt: day(2) },
    { id: "s1", amount: 50_000, occurredAt: day(1) },
    { id: "s3", amount: 20_000, occurredAt: day(3) },
  ];

  it("còn nợ đủ → tất cả UNPAID", () => {
    const out = projectShares(shares, 100_000);
    expect(out.map((s) => s.status)).toEqual(["UNPAID", "UNPAID", "UNPAID"]);
  });

  it("đã trả 60k → cũ nhất PAID, kế tiếp PARTIAL 10k, còn lại UNPAID", () => {
    const out = projectShares(shares, 40_000);
    expect(out).toEqual([
      { id: "s1", paidAmount: 50_000, status: "PAID" },
      { id: "s2", paidAmount: 10_000, status: "PARTIAL" },
      { id: "s3", paidAmount: 0, status: "UNPAID" },
    ]);
  });

  it("hết nợ → tất cả PAID", () => {
    expect(projectShares(shares, 0).every((s) => s.status === "PAID")).toBe(true);
  });

  it("outstanding vượt tổng share → không có gì được coi là đã trả (không ra số âm)", () => {
    expect(projectShares(shares, 999_999).every((s) => s.paidAmount === 0)).toBe(true);
  });

  it("điều chỉnh âm: coi như đã áp dụng, phần dương chỉ cần trả P − outstanding", () => {
    const withAdj = [
      { id: "orig", amount: 37_500, occurredAt: day(1) },
      { id: "adj", amount: -7_500, occurredAt: day(2) },
    ];
    // Bình đã trả đủ 37.500; sau điều chỉnh -7.500 số dư = +7.500 → outstanding 0.
    expect(projectShares(withAdj, 0)).toEqual([
      { id: "orig", paidAmount: 37_500, status: "PAID" },
      { id: "adj", paidAmount: -7_500, status: "PAID" },
    ]);
    // Chưa trả gì: net còn nợ 30.000 → phần âm đã "tiêu" 7.500 của share gốc.
    expect(projectShares(withAdj, 30_000)).toEqual([
      { id: "orig", paidAmount: 7_500, status: "PARTIAL" },
      { id: "adj", paidAmount: -7_500, status: "PAID" },
    ]);
  });

  it("IR-32: sau khi A trả C theo gợi ý, share A→B và B→C đều PAID", () => {
    const shareRows: Share[] = [
      { debtorId: "A", creditorId: "B", amount: 50_000 },
      { debtorId: "B", creditorId: "C", amount: 50_000 },
    ];
    const balances = computeBalances(shareRows, [{ fromId: "A", toId: "C", amount: 50_000 }]);
    const forA = projectShares([{ id: "ab", amount: 50_000, occurredAt: day(1) }], Math.max(0, -(balances.get("A") ?? 0)));
    const forB = projectShares([{ id: "bc", amount: 50_000, occurredAt: day(1) }], Math.max(0, -(balances.get("B") ?? 0)));
    expect(forA[0].status).toBe("PAID");
    expect(forB[0].status).toBe("PAID");
  });
});

describe("settlement code", () => {
  it("sinh 8 ký tự hợp lệ, không có ký tự dễ nhầm", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateSettlementCode();
      expect(code).toHaveLength(8);
      expect(isValidSettlementCode(code)).toBe(true);
      expect(code).not.toMatch(/[IO01]/);
    }
  });

  it("từ chối mã sai độ dài/ký tự", () => {
    expect(isValidSettlementCode("abc")).toBe(false);
    expect(isValidSettlementCode("ABCDEFG0")).toBe(false);
    expect(isValidSettlementCode("ABCDEFGHJ")).toBe(false);
  });
});
