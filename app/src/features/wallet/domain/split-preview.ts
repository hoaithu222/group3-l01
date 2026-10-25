import type { SplitParticipantPayload, SplitType } from '../api/wallet.types';
import { WALLET_LIMITS } from '../constants/wallet.constants';

/**
 * Xem trước cách chia — CÙNG quy tắc làm tròn với BE (`wallet-math.ts#splitExpense`,
 * p6-04 be.md §5). Đây là bản sao tính bằng số NGUYÊN, không phải bản "gần đúng":
 * người dùng thấy "mỗi người 37.500" trên form thì sổ nợ phải ra đúng 37.500.
 *
 *  · EQUAL   `floor(amount / n)` mỗi người, n gồm CẢ người trả nếu có trong danh sách.
 *  · PERCENT `floor(amount · bps / 10000)`.
 *  · CUSTOM  đúng số tiền từng người.
 *  · Người trả không sinh nợ (tự chịu phần mình); phần dư do làm tròn xuống cũng
 *    do NGƯỜI TRẢ chịu. Phần 0 bỏ.
 *
 * ⛔ Đổi quy tắc ở đây mà không đổi BE (hoặc ngược lại) là lệch tiền im lặng — file
 * fixture `tests/fixtures/wallet-split.fixture.json` là hợp đồng giữa hai bên.
 */

export interface SplitInput {
  amount: number;
  splitType: SplitType;
  paidBy: string;
  participants: SplitParticipantPayload[];
}

export interface SplitDebt {
  debtorId: string;
  amount: number;
}

export type SplitProblem =
  | { kind: 'INVALID_AMOUNT' }
  | { kind: 'NO_PARTICIPANTS' }
  | { kind: 'TOO_MANY' }
  /** `unit`: VND cho CUSTOM, BPS (1% = 100) cho PERCENT. `diff` luôn dương. */
  | { kind: 'SHORT'; unit: 'BPS' | 'VND'; diff: number }
  | { kind: 'OVER'; unit: 'BPS' | 'VND'; diff: number };

export interface SplitPreview {
  /** Phần của TỪNG người tham gia (kể cả người trả nếu có trong danh sách). */
  perPerson: { userId: string; owed: number }[];
  /** Nợ thật sinh ra — khớp `splitExpense` của BE: bỏ người trả, bỏ phần 0, sắp theo userId. */
  debts: SplitDebt[];
  /** Người trả gánh: phần của chính mình + phần dư làm tròn. */
  payerBears: number;
  /** Phần dư do làm tròn xuống (EQUAL/PERCENT); CUSTOM luôn 0. */
  remainder: number;
  /** `null` khi hợp lệ — tổng chia khớp và đủ điều kiện gửi lên BE. */
  problem: SplitProblem | null;
  valid: boolean;
}

function owedOf(input: SplitInput, participant: SplitParticipantPayload): number {
  const { amount, participants, splitType } = input;
  if (splitType === 'EQUAL')
    return participants.length > 0 ? Math.floor(amount / participants.length) : 0;
  if (splitType === 'PERCENT') {
    return Math.floor((amount * (participant.bps ?? 0)) / WALLET_LIMITS.bpsTotal);
  }
  return participant.amount ?? 0;
}

function detectProblem(input: SplitInput): SplitProblem | null {
  const { amount, participants, splitType } = input;
  if (!Number.isInteger(amount) || amount < 1 || amount > WALLET_LIMITS.expenseMax) {
    return { kind: 'INVALID_AMOUNT' };
  }
  if (participants.length === 0) return { kind: 'NO_PARTICIPANTS' };
  if (participants.length > WALLET_LIMITS.participantsMax) return { kind: 'TOO_MANY' };
  if (splitType === 'EQUAL') return null;

  const isCustom = splitType === 'CUSTOM';
  const target = isCustom ? amount : WALLET_LIMITS.bpsTotal;
  const total = participants.reduce((sum, p) => sum + ((isCustom ? p.amount : p.bps) ?? 0), 0);
  const unit = isCustom ? 'VND' : 'BPS';
  if (total < target) return { kind: 'SHORT', unit, diff: target - total };
  if (total > target) return { kind: 'OVER', unit, diff: total - target };
  return null;
}

export function previewSplit(input: SplitInput): SplitPreview {
  const problem = detectProblem(input);
  // Số tiền không hợp lệ thì KHÔNG tính phần ai (tránh hiện "mỗi người NaN").
  const usable = problem?.kind !== 'INVALID_AMOUNT';
  const perPerson = input.participants.map((p) => ({
    userId: p.userId,
    owed: usable ? owedOf(input, p) : 0,
  }));

  const debts = perPerson
    .filter((p) => p.userId !== input.paidBy && p.owed > 0)
    .map((p) => ({ debtorId: p.userId, amount: p.owed }))
    .sort((a, b) => (a.debtorId < b.debtorId ? -1 : a.debtorId > b.debtorId ? 1 : 0));

  const owedTotal = debts.reduce((sum, d) => sum + d.amount, 0);
  const sharesTotal = perPerson.reduce((sum, p) => sum + p.owed, 0);

  return {
    perPerson,
    debts,
    payerBears: usable ? input.amount - owedTotal : 0,
    remainder: usable && input.splitType !== 'CUSTOM' ? input.amount - sharesTotal : 0,
    problem,
    valid: problem === null,
  };
}
