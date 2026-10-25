import {
  cronToSchedule,
  describeSchedule,
  scheduleToCron,
  timezoneOptions,
} from '../domain/reminder-cron';
import { VN_BANKS, bankDisplayName, bankLogoIcon, findBankByBin } from '../utils/banks';

describe('lịch nhắc ↔ cron', () => {
  it('thứ + giờ + phút ↔ "m h * * d" (đúng dạng BE `weeklyCronSchema`)', () => {
    expect(scheduleToCron({ hour: 9, minute: 0, weekday: 5 })).toBe('0 9 * * 5');
    expect(cronToSchedule('0 9 * * 5')).toEqual({ hour: 9, minute: 0, weekday: 5 });
    expect(cronToSchedule('30 18 * * 0')).toEqual({ hour: 18, minute: 30, weekday: 0 });
    expect(describeSchedule({ hour: 9, minute: 5, weekday: 5 })).toBe('Thứ Sáu · 09:05');
  });

  it('cron không phải hằng tuần (vd mỗi ngày, danh sách thứ) ⇒ null để UI dùng lịch mặc định', () => {
    expect(cronToSchedule('0 9 * * *')).toBeNull();
    expect(cronToSchedule('0 9 * * 1,5')).toBeNull();
    expect(cronToSchedule('60 9 * * 5')).toBeNull();
    expect(cronToSchedule('0 24 * * 5')).toBeNull();
  });

  it('múi giờ đang lưu và của máy luôn có trong danh sách, không trùng', () => {
    const zones = timezoneOptions('Pacific/Auckland', 'Asia/Tokyo');
    expect(zones[0]).toBe('Pacific/Auckland');
    expect(zones).toContain('Asia/Tokyo');
    expect(new Set(zones).size).toBe(zones.length);
  });
});

describe('bảng ngân hàng VN', () => {
  it('BIN 6 số, không trùng; mã viết tắt không trùng', () => {
    expect(new Set(VN_BANKS.map((bank) => bank.bin)).size).toBe(VN_BANKS.length);
    expect(new Set(VN_BANKS.map((bank) => bank.code)).size).toBe(VN_BANKS.length);
    for (const bank of VN_BANKS) expect(bank.bin).toMatch(/^\d{6}$/);
  });

  it('MỌI logo trong bảng đều có thật trong bộ icon (không rơi về icon chung âm thầm)', () => {
    for (const bank of VN_BANKS) expect(bankLogoIcon(bank.bin)).toBe(`bank/${bank.logo}`);
  });

  it('tra theo BIN; tên hiển thị ưu tiên tên BE, rồi bảng, rồi "Ngân hàng <BIN>"', () => {
    expect(findBankByBin('970436')?.shortName).toBe('Vietcombank');
    expect(bankDisplayName('970436', 'Ngân hàng Ngoại thương')).toBe('Ngân hàng Ngoại thương');
    expect(bankDisplayName('970436', null)).toBe('Vietcombank');
    expect(bankDisplayName('999999', '  ')).toBe('Ngân hàng 999999');
    expect(bankLogoIcon('999999')).toBeUndefined();
  });
});
