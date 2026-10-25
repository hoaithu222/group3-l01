import { choiceLabel, clockOffset, remainingMs, withClockOffset } from '../utils/clock';

/**
 * app.md p5-01 §8: đồng hồ theo SERVER — đúng với độ lệch âm/dương (LQ-09: máy lệch 2 phút vẫn hiển thị đúng). Mock
 * `Date.now`, không đợi thời gian thật.
 */

const CLIENT_NOW = 1_800_000_000_000;

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(CLIENT_NOW);
});

afterEach(() => jest.restoreAllMocks());

describe('clockOffset', () => {
  it('offset = serverNow − Date.now() — dương khi máy CHẬM hơn server, âm khi máy NHANH hơn', () => {
    expect(clockOffset(CLIENT_NOW + 120_000)).toBe(120_000);
    expect(clockOffset(CLIENT_NOW - 90_000)).toBe(-90_000);
  });

  it('thiếu serverNow ⇒ 0 (không tự bịa độ lệch)', () => {
    expect(clockOffset(undefined)).toBe(0);
  });
});

describe('remainingMs', () => {
  it('máy chậm 2 phút: hạn theo giờ server vẫn còn đúng 10 s', () => {
    const offset = 120_000;
    const serverNow = CLIENT_NOW + offset;
    expect(remainingMs(serverNow + 10_000, offset)).toBe(10_000);
  });

  it('máy nhanh 90 s: hạn theo giờ server vẫn còn đúng 7 s (không bị tính là đã quá hạn)', () => {
    const offset = -90_000;
    const serverNow = CLIENT_NOW + offset;
    expect(remainingMs(serverNow + 7_000, offset)).toBe(7_000);
  });

  it('quá hạn ⇒ 0, không âm', () => {
    expect(remainingMs(CLIENT_NOW - 5_000, 0)).toBe(0);
  });

  it('không có offset (đồng hồ khớp) ⇒ hiệu thẳng', () => {
    expect(remainingMs(CLIENT_NOW + 3_500, 0)).toBe(3_500);
  });
});

describe('withClockOffset', () => {
  it('gắn clockOffsetMs vào snapshot, giữ nguyên các trường còn lại', () => {
    const snapshot = withClockOffset({ id: 's1', serverNow: CLIENT_NOW + 4_000 });
    expect(snapshot).toEqual({ clockOffsetMs: 4_000, id: 's1', serverNow: CLIENT_NOW + 4_000 });
  });
});

describe('choiceLabel', () => {
  it('A–F theo chỉ số; ngoài dải rơi về số thứ tự', () => {
    expect([0, 1, 2, 3].map(choiceLabel)).toEqual(['A', 'B', 'C', 'D']);
    expect(choiceLabel(9)).toBe('10');
  });
});
