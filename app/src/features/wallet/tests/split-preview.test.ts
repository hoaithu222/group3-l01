import type { SplitParticipantPayload, SplitType } from '../api';
import { describeSplitProblem } from '../domain/split-message';
import { previewSplit } from '../domain/split-preview';
import fixture from './fixtures/wallet-split.fixture.json';

interface FixtureCase {
  name: string;
  amount: number;
  splitType: SplitType;
  paidBy: string;
  participants: SplitParticipantPayload[];
  expected: {
    debts: { debtorId: string; amount: number }[];
    creditorOwed: number;
    payerBears: number;
    remainder: number;
  };
}

/**
 * ⛔ Test này giữ cho bản xem trước ở app KHÔNG lệch sổ nợ thật của BE (`wallet-math.ts#splitExpense`):
 * lệch một đồng là người dùng thấy "mỗi người 37.500" trên form nhưng nợ 37.501 trong sổ. Cả hai bên
 * chạy CÙNG fixture `fixtures/wallet-split.fixture.json`.
 */
describe('previewSplit — fixture dùng chung với BE', () => {
  it.each(fixture.cases as FixtureCase[])(
    '$name',
    ({ amount, expected, paidBy, participants, splitType }) => {
      const preview = previewSplit({ amount, paidBy, participants, splitType });

      expect(preview.problem).toBeNull();
      expect(preview.valid).toBe(true);
      expect(preview.debts).toEqual(expected.debts);
      expect(preview.debts.reduce((sum, debt) => sum + debt.amount, 0)).toBe(expected.creditorOwed);
      expect(preview.payerBears).toBe(expected.payerBears);
      expect(preview.remainder).toBe(expected.remainder);
      // Bất biến của sổ: nợ + phần người trả gánh luôn ĐÚNG bằng số tiền khoản chi.
      expect(preview.debts.reduce((sum, debt) => sum + debt.amount, 0) + preview.payerBears).toBe(
        amount,
      );
    },
  );
});

describe('previewSplit — tổng chia sai (khoá nút Lưu)', () => {
  const base = { amount: 90000, paidBy: 'A' } as const;

  it('CUSTOM thiếu: báo "còn thiếu" bằng đồng', () => {
    const preview = previewSplit({
      ...base,
      participants: [
        { userId: 'A', amount: 30000 },
        { userId: 'B', amount: 50000 },
      ],
      splitType: 'CUSTOM',
    });
    expect(preview.valid).toBe(false);
    expect(preview.problem).toEqual({ diff: 10000, kind: 'SHORT', unit: 'VND' });
    expect(describeSplitProblem(preview.problem!)).toBe('Còn thiếu 10.000 VND');
  });

  it('CUSTOM thừa: báo "thừa"', () => {
    const preview = previewSplit({
      ...base,
      participants: [
        { userId: 'A', amount: 30000 },
        { userId: 'B', amount: 65000 },
      ],
      splitType: 'CUSTOM',
    });
    expect(preview.problem).toEqual({ diff: 5000, kind: 'OVER', unit: 'VND' });
    expect(describeSplitProblem(preview.problem!)).toBe('Thừa 5.000 VND');
  });

  it('PERCENT: tổng phải ĐÚNG 100% — thiếu/thừa báo bằng phần trăm', () => {
    const short = previewSplit({
      ...base,
      participants: [
        { bps: 5000, userId: 'A' },
        { bps: 4000, userId: 'B' },
      ],
      splitType: 'PERCENT',
    });
    expect(short.problem).toEqual({ diff: 1000, kind: 'SHORT', unit: 'BPS' });
    expect(describeSplitProblem(short.problem!)).toBe('Còn thiếu 10%');

    const over = previewSplit({
      ...base,
      participants: [
        { bps: 6000, userId: 'A' },
        { bps: 4050, userId: 'B' },
      ],
      splitType: 'PERCENT',
    });
    expect(describeSplitProblem(over.problem!)).toBe('Thừa 0,5%');
  });

  it('số tiền không hợp lệ ⇒ không tính phần ai (không hiện "mỗi người NaN")', () => {
    for (const amount of [0, -5, 1.5, Number.NaN, 100_000_001]) {
      const preview = previewSplit({
        amount,
        paidBy: 'A',
        participants: [{ userId: 'B' }],
        splitType: 'EQUAL',
      });
      expect(preview.problem).toEqual({ kind: 'INVALID_AMOUNT' });
      expect(preview.perPerson).toEqual([{ owed: 0, userId: 'B' }]);
      expect(preview.payerBears).toBe(0);
    }
  });

  it('không có người tham gia / quá 50 người', () => {
    expect(previewSplit({ ...base, participants: [], splitType: 'EQUAL' }).problem).toEqual({
      kind: 'NO_PARTICIPANTS',
    });
    const fifty1 = Array.from({ length: 51 }, (_, index) => ({ userId: `u${index}` }));
    expect(previewSplit({ ...base, participants: fifty1, splitType: 'EQUAL' }).problem).toEqual({
      kind: 'TOO_MANY',
    });
  });
});
