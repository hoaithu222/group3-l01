import { classifyContactInput } from '@/shared/utils/contact.utils';
import { formatPhoneDisplay, isEmptyOrValidPhone, normalizePhone } from '@/shared/utils/phone.utils';

/**
 * Bảng ví dụ GIỐNG HỆT `be/src/core/utils/tests/phone.test.ts` — hai bên phải chuẩn hoá cùng một kết quả, nếu không
 * client báo "hợp lệ" mà BE từ chối 400 (hoặc ngược lại).
 */
describe('normalizePhone — số Việt Nam (đồng bộ BE)', () => {
  it.each([
    ['0912345678', '+84912345678'],
    ['0912 345 678', '+84912345678'],
    ['091.234.5678', '+84912345678'],
    ['(091) 234-5678', '+84912345678'],
    ['+84912345678', '+84912345678'],
    ['+84 912 345 678', '+84912345678'],
    ['84912345678', '+84912345678'],
    ['0084912345678', '+84912345678'],
    ['+84 (0) 912345678', '+84912345678'],
    ['+840912345678', '+84912345678'],
    ['0387654321', '+84387654321'],
    ['0587654321', '+84587654321'],
    ['0787654321', '+84787654321'],
    ['0887654321', '+84887654321'],
    ['024 3812 3456', '+842438123456'],
    ['02838123456', '+842838123456'],
    ['  0912345678\n', '+84912345678'],
  ])('%j → %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each([
    '091234567',
    '09123456789',
    '0112345678',
    '0412345678',
    '912345678',
    '+84 12345678',
    'abc',
    '',
    '   ',
    '0912-abc-678',
    '+',
    '0912345678 ext 12',
    '09123456789012345678901234567890123',
    '09123+45678',
  ])('từ chối %j', (raw) => {
    expect(normalizePhone(raw)).toBeNull();
  });
});

describe('normalizePhone — số quốc tế', () => {
  it.each([
    ['+1 415 555 2671', '+14155552671'],
    ['+44 20 7946 0958', '+442079460958'],
    ['0014155552671', '+14155552671'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it('từ chối quá ngắn/quá dài, mã quốc gia bắt đầu bằng 0, hoặc thiếu + / 00', () => {
    expect(normalizePhone('+1234567')).toBeNull();
    expect(normalizePhone('+1234567890123456')).toBeNull();
    expect(normalizePhone('+0123456789')).toBeNull();
    expect(normalizePhone('14155552671')).toBeNull();
  });
});

describe('isEmptyOrValidPhone (ô SĐT không bắt buộc)', () => {
  it('rỗng/khoảng trắng/undefined hợp lệ; sai hình dạng thì không', () => {
    expect(isEmptyOrValidPhone(undefined)).toBe(true);
    expect(isEmptyOrValidPhone('')).toBe(true);
    expect(isEmptyOrValidPhone('   ')).toBe(true);
    expect(isEmptyOrValidPhone('0912 345 678')).toBe(true);
    expect(isEmptyOrValidPhone('0912')).toBe(false);
  });
});

describe('formatPhoneDisplay', () => {
  it('số VN → dạng người Việt đọc; quốc tế giữ E.164', () => {
    expect(formatPhoneDisplay('+84912345678')).toBe('0912 345 678');
    expect(formatPhoneDisplay('+842438123456')).toBe('024 3812 3456');
    expect(formatPhoneDisplay('+14155552671')).toBe('+14155552671');
  });
});

describe('classifyContactInput (đồng bộ classifyContactQuery của BE)', () => {
  it('email đầy đủ → EMAIL chữ thường; SĐT → PHONE E.164', () => {
    expect(classifyContactInput('  Lan.Nguyen@Gmail.COM ')).toEqual({ kind: 'EMAIL', value: 'lan.nguyen@gmail.com' });
    expect(classifyContactInput('0912 345 678')).toEqual({ kind: 'PHONE', value: '+84912345678' });
  });

  it('tên / email dở dang / số dở dang → INCOMPLETE (KHÔNG khớp tiền tố)', () => {
    for (const raw of ['Nguyễn Văn A', 'lan@', '@lan', 'lan@gmail', '0912', '']) {
      expect(classifyContactInput(raw).kind).toBe('INCOMPLETE');
    }
  });

  it('email quá 254 ký tự → INCOMPLETE', () => {
    expect(classifyContactInput(`${'a'.repeat(250)}@x.vn`).kind).toBe('INCOMPLETE');
  });
});
