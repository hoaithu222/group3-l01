import { describeBalance, formatMoney, formatMoneyInput, parseMoneyInput } from '../domain/money';

describe('parseMoneyInput — ô nhập số tiền', () => {
  it('lọc mọi ký tự không phải chữ số (dấu chấm, phẩy, "đ", khoảng trắng)', () => {
    expect(parseMoneyInput('1.234.567')).toBe(1234567);
    expect(parseMoneyInput('1,5')).toBe(15);
    expect(parseMoneyInput('  37 500 đ')).toBe(37500);
    expect(parseMoneyInput('abc')).toBeNull();
    expect(parseMoneyInput('')).toBeNull();
  });

  it('bỏ số 0 đứng đầu; "0" giữ nguyên là 0 (khác ô trống)', () => {
    expect(parseMoneyInput('000123')).toBe(123);
    expect(parseMoneyInput('0')).toBe(0);
  });

  it('chặn trần tại chỗ — không nhảy sang số khác, và không tràn Number với chuỗi rất dài', () => {
    expect(parseMoneyInput('999999999')).toBe(100_000_000);
    expect(parseMoneyInput('9'.repeat(40))).toBe(100_000_000);
    expect(parseMoneyInput('5000', 1000)).toBe(1000);
  });

  it('hiển thị có phân cách nghìn theo quy ước VN (dấu chấm)', () => {
    expect(formatMoneyInput(1234567)).toBe('1.234.567');
    expect(formatMoneyInput(null)).toBe('');
    expect(formatMoney(37500)).toBe('37.500 VND');
  });
});

describe('describeBalance — số âm nói bằng chữ, không dấu trừ', () => {
  it('đang nợ / được nợ / hết nợ', () => {
    expect(describeBalance(-37500)).toEqual({
      headline: 'Bạn đang nợ 37.500 VND',
      short: 'nợ 37.500 VND',
      tone: 'debt',
    });
    expect(describeBalance(12000)).toEqual({
      headline: 'Bạn được nợ 12.000 VND',
      short: 'được nợ 12.000 VND',
      tone: 'credit',
    });
    expect(describeBalance(0).headline).toBe('Đã thanh toán hết');
  });

  it('KHÔNG BAO GIỜ có dấu trừ trong câu chữ', () => {
    for (const value of [-1, -37500, -100_000_000]) {
      const { headline, short } = describeBalance(value);
      expect(headline).not.toMatch(/-/);
      expect(short).not.toMatch(/-/);
    }
  });

  it('số dư của NGƯỜI KHÁC không xưng "Bạn"', () => {
    expect(describeBalance(-500, 'other').headline).toBe('đang nợ 500 VND');
    expect(describeBalance(0, 'other').headline).toBe('Không nợ ai');
  });
});
