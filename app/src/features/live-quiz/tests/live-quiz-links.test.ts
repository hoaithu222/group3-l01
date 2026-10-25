import { cleanPin, liveDeepLink, pinFromLink } from '../utils/live-quiz-links';

/** app.md p5-01 §1: deep link `superapp://live/{pin}` → màn tham gia với PIN điền sẵn. */

describe('cleanPin', () => {
  it('chỉ giữ chữ số, tối đa 6', () => {
    expect(cleanPin('123-456')).toBe('123456');
    expect(cleanPin('1234567890')).toBe('123456');
    expect(cleanPin('abc')).toBe('');
  });

  it('nhận cả mảng (Expo Router có thể trả string[]) và undefined', () => {
    expect(cleanPin(['654321', '111111'])).toBe('654321');
    expect(cleanPin(undefined)).toBe('');
  });
});

describe('pinFromLink', () => {
  it.each([
    ['superapp://live/123456', '123456'],
    ['https://superapp.vcijsc.com/live/654321', '654321'],
    ['https://superapp.vcijsc.com/live/654321?utm=x', '654321'],
    ['/live/000123', '000123'],
    ['  superapp://live/123456/  ', '123456'],
  ])('%s ⇒ %s', (url, pin) => {
    expect(pinFromLink(url)).toBe(pin);
  });

  it.each([
    'superapp://live/12345',
    'superapp://live/1234567',
    'superapp://live/12a456',
    'superapp://meeting/123456',
    'https://superapp.vcijsc.com/delive/123456',
    '',
  ])('%s ⇒ null (không đoán mã sai)', (url) => {
    expect(pinFromLink(url)).toBeNull();
  });
});

describe('liveDeepLink', () => {
  it('dạng <scheme>://live/{pin}; không đọc được cấu hình ⇒ scheme mặc định superapp', () => {
    expect(liveDeepLink('123456')).toMatch(/^[a-z][a-z0-9+.-]*:\/\/live\/123456$/);
  });
});
