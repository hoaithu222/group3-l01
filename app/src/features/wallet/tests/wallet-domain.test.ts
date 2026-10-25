import { toAccountName } from '../domain/account-name';
import { describeExpenseAmount, describeMyShare } from '../domain/expense-text';
import { bpsToPercentText, percentTextToBps } from '../domain/percent';
import { maxSettleAmount } from '../domain/settle-limit';

describe('phần trăm ↔ basis points', () => {
  it('bps → chữ, dấu phẩy thập phân, bỏ số 0 thừa', () => {
    expect(bpsToPercentText(3333)).toBe('33,33');
    expect(bpsToPercentText(5000)).toBe('50');
    expect(bpsToPercentText(3350)).toBe('33,5');
    expect(bpsToPercentText(5)).toBe('0,05');
    expect(bpsToPercentText(null)).toBe('');
  });

  it('chữ → bps: nhận cả , lẫn . làm dấu thập phân, cắt còn 2 chữ số, trần 100%', () => {
    expect(percentTextToBps('33,33')).toBe(3333);
    expect(percentTextToBps('33.5')).toBe(3350);
    expect(percentTextToBps('12,345')).toBe(1234);
    expect(percentTextToBps('250')).toBe(10000);
    expect(percentTextToBps('')).toBeNull();
    expect(percentTextToBps(',')).toBeNull();
    expect(percentTextToBps('7%')).toBe(700);
  });
});

describe('toAccountName — tên chủ TK IN HOA không dấu', () => {
  it('bỏ dấu, kể cả Đ/đ (NFD không tách được)', () => {
    expect(toAccountName('Nguyễn Văn Đạt')).toBe('NGUYEN VAN DAT');
    expect(toAccountName('trần thị bích ngọc')).toBe('TRAN THI BICH NGOC');
  });

  it('KHÔNG cắt khoảng trắng cuối (chạy mỗi lần gõ — cắt là không gõ nổi dấu cách), gom khoảng trắng đôi', () => {
    expect(toAccountName('NGUYEN ')).toBe('NGUYEN ');
    expect(toAccountName('A   B')).toBe('A B');
  });

  it('loại ký tự lạ', () => {
    expect(toAccountName('A-B_C.D@E')).toBe('ABCDE');
  });
});

describe('maxSettleAmount — trần trả nợ', () => {
  const summary = {
    balances: [
      { balance: -50000, userId: 'me' },
      { balance: 30000, userId: 'a' },
      { balance: 20000, userId: 'b' },
      { balance: 0, userId: 'c' },
    ],
  };

  it('min(nợ của tôi, số người kia được nợ)', () => {
    expect(maxSettleAmount(summary, 'me', 'a')).toBe(30000);
    expect(maxSettleAmount(summary, 'me', 'b')).toBe(20000);
  });

  it('người kia không được nợ, hoặc tôi không nợ ⇒ 0 (khoá nút, không để nhận WALLET_005)', () => {
    expect(maxSettleAmount(summary, 'me', 'c')).toBe(0);
    expect(maxSettleAmount(summary, 'a', 'b')).toBe(0);
  });

  it('chưa biết ⇒ null', () => {
    expect(maxSettleAmount(undefined, 'me', 'a')).toBeNull();
    expect(maxSettleAmount(summary, undefined, 'a')).toBeNull();
    expect(maxSettleAmount(summary, 'me', undefined)).toBeNull();
  });
});

describe('describeExpenseAmount / describeMyShare', () => {
  it('khoản ĐIỀU CHỈNH âm nói "Giảm", dương nói "Tăng" — không dấu trừ trần', () => {
    expect(describeExpenseAmount({ amount: -10000, kind: 'ADJUSTMENT' })).toBe('Giảm 10.000 VND');
    expect(describeExpenseAmount({ amount: 5000, kind: 'ADJUSTMENT' })).toBe('Tăng 5.000 VND');
    expect(describeExpenseAmount({ amount: 150000, kind: 'EXPENSE' })).toBe('150.000 VND');
  });

  it('phần của tôi: người trả / còn nợ / đã trả / không tham gia', () => {
    expect(describeMyShare({ myShare: null, paidBy: 'me' }, 'me')).toEqual({
      text: 'Bạn đã trả khoản này',
      tone: 'payer',
    });
    expect(
      describeMyShare(
        { myShare: { amount: 37500, paidAmount: 0, status: 'UNPAID' }, paidBy: 'a' },
        'me',
      ),
    ).toEqual({
      text: 'Bạn nợ 37.500 VND',
      tone: 'debt',
    });
    expect(
      describeMyShare(
        { myShare: { amount: 37500, paidAmount: 10000, status: 'PARTIAL' }, paidBy: 'a' },
        'me',
      )?.text,
    ).toBe('Bạn còn nợ 27.500 VND');
    expect(
      describeMyShare(
        { myShare: { amount: 37500, paidAmount: 37500, status: 'PAID' }, paidBy: 'a' },
        'me',
      )?.tone,
    ).toBe('paid');
    expect(describeMyShare({ myShare: null, paidBy: 'a' }, 'me')).toBeNull();
  });
});
