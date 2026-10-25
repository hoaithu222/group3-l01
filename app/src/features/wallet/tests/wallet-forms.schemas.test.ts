import {
  expenseFormSchema,
  paymentProfileFormSchema,
  walletSettingsFormSchema,
} from '../schemas/wallet-forms.schemas';
import { splitDraftForTest } from './helpers';

describe('schema form', () => {
  const valid = {
    amount: 150000,
    category: 'FOOD' as const,
    description: '  Ăn trưa  ',
    occurredAt: new Date(),
    paidBy: 'A',
    split: splitDraftForTest(),
  };

  it('khoản chi hợp lệ: cắt khoảng trắng mô tả, đầu ra amount là số (không phải number | null)', () => {
    const result = expenseFormSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBe('Ăn trưa');
  });

  it('số tiền trống/0 ⇒ lỗi gắn vào ĐÚNG trường amount', () => {
    for (const amount of [null, 0]) {
      const result = expenseFormSchema.safeParse({ ...valid, amount });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0]?.path).toEqual(['amount']);
    }
  });

  it('tổng chia sai ⇒ lỗi gắn vào `split` với đúng câu "Còn thiếu …" người dùng đang thấy', () => {
    const result = expenseFormSchema.safeParse({
      ...valid,
      split: splitDraftForTest({ custom: { A: 100000, B: 40000 }, splitType: 'CUSTOM' }),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['split']);
      expect(result.error.issues[0]?.message).toBe('Còn thiếu 10.000 VND');
    }
  });

  it('mô tả trống ⇒ lỗi; quá 200 ký tự ⇒ lỗi', () => {
    expect(expenseFormSchema.safeParse({ ...valid, description: '   ' }).success).toBe(false);
    expect(expenseFormSchema.safeParse({ ...valid, description: 'x'.repeat(201) }).success).toBe(
      false,
    );
  });

  it('hồ sơ nhận tiền: BIN 6 số, TK 6–19 số', () => {
    const ok = {
      accountName: 'NGUYEN VAN A',
      accountNumber: '0123456789',
      bankBin: '970436',
      isDefault: true,
    };
    expect(paymentProfileFormSchema.safeParse(ok).success).toBe(true);
    expect(paymentProfileFormSchema.safeParse({ ...ok, bankBin: '' }).success).toBe(false);
    expect(paymentProfileFormSchema.safeParse({ ...ok, accountNumber: '12345' }).success).toBe(
      false,
    );
    expect(
      paymentProfileFormSchema.safeParse({ ...ok, accountNumber: '1'.repeat(20) }).success,
    ).toBe(false);
    expect(paymentProfileFormSchema.safeParse({ ...ok, accountName: ' ' }).success).toBe(false);
  });

  it('cài đặt nhắc: có nơi đăng thì PHẢI có id (BE `WALLET_008`/VAL_001 hai chiều)', () => {
    const base = {
      hour: 9,
      minute: 0,
      reminderEnabled: true,
      reminderMinDebt: 10000,
      reminderTargetId: null,
      reminderTargetType: 'NONE' as const,
      timezone: 'Asia/Ho_Chi_Minh',
      weekday: 5,
    };
    expect(walletSettingsFormSchema.safeParse(base).success).toBe(true);
    const missing = walletSettingsFormSchema.safeParse({ ...base, reminderTargetType: 'CHANNEL' });
    expect(missing.success).toBe(false);
    if (!missing.success) expect(missing.error.issues[0]?.path).toEqual(['reminderTargetId']);
    expect(
      walletSettingsFormSchema.safeParse({
        ...base,
        reminderTargetId: 'c1',
        reminderTargetType: 'CHANNEL',
      }).success,
    ).toBe(true);
    expect(
      walletSettingsFormSchema.safeParse({ ...base, reminderMinDebt: 2_000_000 }).success,
    ).toBe(false);
  });
});
