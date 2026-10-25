import { pinGroups } from '../utils/pin-format';
import { formatQuizDuration } from '../utils/quiz-duration';

describe('formatQuizDuration', () => {
  it('giây / phút giây / giờ phút — chỉ giữ hai đơn vị lớn nhất', () => {
    expect(formatQuizDuration(45)).toBe('45 giây');
    expect(formatQuizDuration(60)).toBe('1 phút');
    expect(formatQuizDuration(200)).toBe('3 phút 20 giây');
    expect(formatQuizDuration(6000)).toBe('1 giờ 40 phút');
    // Đơn vị bằng 0 bị bỏ; hai đơn vị lớn nhất CÒN LẠI mới được giữ.
    expect(formatQuizDuration(3605)).toBe('1 giờ 5 giây');
    expect(formatQuizDuration(3725)).toBe('1 giờ 2 phút');
  });

  it('phiên dài nhất BE cho (50 câu × 120 s) và phiên ngắn nhất (1 câu × 5 s)', () => {
    expect(formatQuizDuration(50 * 120)).toBe('1 giờ 40 phút');
    expect(formatQuizDuration(1 * 5)).toBe('5 giây');
  });

  it('0 hoặc số không hợp lệ ⇒ "0 giây", không chuỗi rỗng', () => {
    expect(formatQuizDuration(0)).toBe('0 giây');
    expect(formatQuizDuration(-10)).toBe('0 giây');
  });
});

describe('pinGroups', () => {
  it('PIN 6 số ⇒ hai nhóm 3', () => {
    expect(pinGroups('123456')).toEqual(['123', '456']);
  });

  it('độ dài lạ vẫn không mất số nào', () => {
    expect(pinGroups('12345')).toEqual(['123', '45']);
    expect(pinGroups('')).toEqual([]);
  });
});
