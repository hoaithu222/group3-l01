import { parseView, WalletContractError } from '../api';
import {
  expenseDetailViewSchema,
  walletSettingsViewSchema,
  walletSummaryViewSchema,
} from '../schemas/wallet.schemas';
import { paymentInfoViewSchema, settlementViewSchema } from '../schemas/wallet-payments.schemas';

const EXPENSE = {
  adjustments: [],
  adjustsExpenseId: null,
  amount: 150000,
  canManage: true,
  category: 'FOOD',
  createdAt: '2026-09-10T05:00:00.000Z',
  createdBy: 'a',
  description: 'Ăn trưa',
  id: 'e1',
  kind: 'EXPENSE',
  myShare: { amount: 37500, paidAmount: 0, status: 'UNPAID' },
  occurredAt: '2026-09-10T05:00:00.000Z',
  paidBy: 'a',
  participants: [{ userId: 'a' }, { amount: 100, bps: 5000, userId: 'b' }],
  receiptAssetId: null,
  shares: [
    { amount: 37500, creditorId: 'a', debtorId: 'b', id: 's1', paidAmount: 0, status: 'UNPAID' },
  ],
  splitType: 'EQUAL',
  version: 1,
  workspaceId: 'w1',
};

describe('schema phản hồi — dữ liệu TIỀN', () => {
  it('parse khoản chi đủ trường; vắng mặt và null đều ra `null` (một dạng duy nhất)', () => {
    const parsed = expenseDetailViewSchema.parse({
      ...EXPENSE,
      receiptAssetId: undefined,
      adjustsExpenseId: null,
    });
    expect(parsed.receiptAssetId).toBeNull();
    expect(parsed.adjustsExpenseId).toBeNull();
    expect(parsed.participants[0]).toEqual({ amount: null, bps: null, userId: 'a' });
  });

  it('⛔ số tiền THỰC bị từ chối (BE đổi sang Decimal/ép sai kiểu thì phải nổ, không hiện "37.500,5")', () => {
    expect(() => expenseDetailViewSchema.parse({ ...EXPENSE, amount: 150000.5 })).toThrow();
    expect(() =>
      walletSummaryViewSchema.parse({
        balances: [],
        currency: 'VND',
        myBalance: -10.5,
        suggestions: [],
        totals: { expensesThisMonth: 0, outstanding: 0 },
        walletVersion: 1,
      }),
    ).toThrow();
  });

  it('khoản ĐIỀU CHỈNH được phép ÂM; số dư âm được', () => {
    expect(
      expenseDetailViewSchema.parse({ ...EXPENSE, amount: -20000, kind: 'ADJUSTMENT' }).amount,
    ).toBe(-20000);
    const summary = walletSummaryViewSchema.parse({
      balances: [{ balance: -37500, userId: 'b' }],
      currency: 'VND',
      myBalance: -37500,
      suggestions: [{ amount: 37500, fromId: 'b', toId: 'a' }],
      totals: { expensesThisMonth: 150000, outstanding: 37500 },
      walletVersion: 7,
    });
    expect(summary.myBalance).toBe(-37500);
  });

  it('trường lạ BE thêm về sau bị bỏ qua (không làm app giòn với thay đổi tương thích ngược)', () => {
    expect(expenseDetailViewSchema.parse({ ...EXPENSE, newField: 'x' })).not.toHaveProperty(
      'newField',
    );
  });

  it('danh mục là chuỗi (BE mở rộng LIMITS.wallet.categories không phá app cũ)', () => {
    expect(expenseDetailViewSchema.parse({ ...EXPENSE, category: 'PARTY' }).category).toBe('PARTY');
  });

  it('settlement · payment-info · cài đặt ví', () => {
    expect(
      settlementViewSchema.parse({
        allocations: [{ amount: 37500, shareId: 's1' }],
        amount: 37500,
        code: 'ABCD2345',
        createdAt: '2026-09-11T00:00:00.000Z',
        fromId: 'b',
        id: 'st1',
        method: 'BANK',
        status: 'PENDING',
        toId: 'a',
        version: 1,
        workspaceId: 'w1',
      }),
    ).toMatchObject({ note: null, proofAssetId: null, rejectReason: null });
    expect(
      paymentInfoViewSchema.parse({
        accountName: 'NGUYEN VAN A',
        accountNumber: '0123456789',
        bankBin: '970436',
        reference: 'ABCD2345',
        suggestedAmount: 37500,
      }).bankName,
    ).toBeNull();
    expect(
      walletSettingsViewSchema.parse({
        currency: 'VND',
        enabled: true,
        lastRemindedAt: null,
        myActions: { canManageSettings: true, canRemind: true },
        reminderCron: '0 9 * * 5',
        reminderEnabled: true,
        reminderMinDebt: 10000,
        reminderTargetId: null,
        reminderTargetType: 'NONE',
        timezone: 'Asia/Ho_Chi_Minh',
        version: 2,
        walletVersion: 5,
        workspaceId: 'w1',
      }).reminderTargetId,
    ).toBeNull();
  });

  it('parseView: lệch hợp đồng ⇒ WalletContractError tiếng Việt, không phải ZodError thô', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => parseView(expenseDetailViewSchema, { id: 1 }, 'khoản chi')).toThrow(
      WalletContractError,
    );
    expect(() => parseView(expenseDetailViewSchema, { id: 1 }, 'khoản chi')).toThrow(
      /Dữ liệu khoản chi không đúng định dạng/,
    );
    jest.restoreAllMocks();
  });
});
