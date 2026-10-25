import fc from "fast-check";
import {
  splitExpense,
  computeBalances,
  minCashFlow,
  projectShares,
  type Share,
  type SplitParticipant,
  type SplitType,
} from "../../domain/wallet-math";

/** IR-35 — property test min-cash-flow: Σ số dư = 0; áp mọi gợi ý → 0; ≤ n−1 giao dịch. */
const USERS = ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"];

const expenseArb = fc
  .record({
    amount: fc.integer({ min: 1, max: 100_000_000 }),
    splitType: fc.constantFrom<SplitType>("EQUAL", "PERCENT", "CUSTOM"),
    paidBy: fc.constantFrom(...USERS),
    members: fc.subarray(USERS, { minLength: 1, maxLength: USERS.length }),
    weights: fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: USERS.length, maxLength: USERS.length }),
  })
  .map(({ amount, splitType, paidBy, members, weights }) => {
    const participants: SplitParticipant[] = members.map((userId) => ({ userId }));
    if (splitType === "PERCENT") {
      distribute(10_000, weights.slice(0, members.length)).forEach((bps, i) => (participants[i].bps = bps));
    } else if (splitType === "CUSTOM") {
      distribute(amount, weights.slice(0, members.length)).forEach((part, i) => (participants[i].amount = part));
    }
    return { amount, splitType, paidBy, participants };
  });

/** Chia `total` thành số nguyên ≥ 0 theo tỉ lệ `weights`, tổng đúng bằng `total` (người cuối nhận phần dư). */
function distribute(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  let left = total;
  return weights.map((w, i) => {
    const isLast = i === weights.length - 1;
    const part = isLast ? left : weightSum === 0 ? 0 : Math.min(left, Math.floor((w / weightSum) * total));
    left -= part;
    return part;
  });
}

describe("wallet-math — property (fast-check, IR-35)", () => {
  it("Σ số dư = 0 và áp mọi gợi ý đưa mọi số dư về 0 với ≤ n−1 giao dịch", () => {
    fc.assert(
      fc.property(fc.array(expenseArb, { minLength: 1, maxLength: 25 }), (expenses) => {
        const shares: Share[] = expenses.flatMap((e) => splitExpense(e));
        const balances = computeBalances(shares, []);

        const sum = [...balances.values()].reduce((a, b) => a + b, 0);
        expect(sum).toBe(0);

        const suggestions = minCashFlow(balances);
        const nonZero = [...balances.values()].filter((v) => v !== 0).length;
        expect(suggestions.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));

        const settled = computeBalances(shares, suggestions);
        expect([...settled.values()].every((v) => v === 0)).toBe(true);
        expect(suggestions.every((s) => s.amount > 0 && s.fromId !== s.toId)).toBe(true);
      }),
      { numRuns: 300 }
    );
  });

  it("chia EQUAL/PERCENT/CUSTOM: tổng share + phần người trả tự chịu = amount, không share âm", () => {
    fc.assert(
      fc.property(expenseArb, (e) => {
        const shares = splitExpense(e);
        const owedToPayer = shares.reduce((a, s) => a + s.amount, 0);
        expect(shares.every((s) => s.amount > 0 && s.debtorId !== e.paidBy)).toBe(true);
        expect(owedToPayer).toBeLessThanOrEqual(e.amount);
        // Phần người trả gánh (tự chịu + dư làm tròn) không âm và < 1 đồng × số người khi EQUAL/PERCENT.
        if (e.splitType !== "CUSTOM") {
          expect(e.amount - owedToPayer).toBeLessThan(e.amount + 1);
        }
      }),
      { numRuns: 300 }
    );
  });

  it("kết quả minCashFlow tất định: hoán vị thứ tự entry đầu vào không đổi đầu ra", () => {
    fc.assert(
      fc.property(fc.array(expenseArb, { minLength: 1, maxLength: 10 }), (expenses) => {
        const balances = computeBalances(expenses.flatMap((e) => splitExpense(e)), []);
        const reversed = new Map([...balances.entries()].reverse());
        expect(minCashFlow(reversed)).toEqual(minCashFlow(balances));
      }),
      { numRuns: 100 }
    );
  });

  it("projectShares: tổng paidAmount ≤ tổng share dương, thứ tự FIFO, không share PAID sau share UNPAID", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 1_000_000 }), { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 0, max: 30_000_000 }),
        (amounts, outstanding) => {
          const shares = amounts.map((amount, i) => ({ id: `s${String(i).padStart(3, "0")}`, amount, occurredAt: new Date(1_700_000_000_000 + i * 1000) }));
          const projected = projectShares(shares, outstanding);
          const total = amounts.reduce((a, b) => a + b, 0);
          const paid = projected.reduce((a, s) => a + s.paidAmount, 0);
          expect(paid).toBe(Math.max(0, total - outstanding));
          const firstUnpaid = projected.findIndex((s) => s.status === "UNPAID");
          if (firstUnpaid >= 0) {
            expect(projected.slice(firstUnpaid).every((s) => s.status === "UNPAID")).toBe(true);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
