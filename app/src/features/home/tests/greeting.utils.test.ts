import { getGreeting, getGreetingScene } from '../utils/greeting.utils';

describe('getGreeting', () => {
  it.each([
    [5, 'Chào buổi sáng'],
    [10, 'Chào buổi sáng'],
    [11, 'Chào buổi trưa'],
    [12, 'Chào buổi trưa'],
    [13, 'Chào buổi chiều'],
    [17, 'Chào buổi chiều'],
    [18, 'Chào buổi tối'],
    [23, 'Chào buổi tối'],
    [0, 'Chào buổi tối'],
    [4, 'Chào buổi tối'],
  ])('%i giờ → %s', (hour, expected) => {
    expect(getGreeting(hour)).toBe(expected);
  });

  it('giờ ngoài 0–23 (dữ liệu hỏng) không ném lỗi, rơi về buổi tối', () => {
    expect(getGreeting(-1)).toBe('Chào buổi tối');
    expect(getGreeting(99)).toBe('Chào buổi tối');
    expect(getGreeting(Number.NaN)).toBe('Chào buổi tối');
  });
});

describe('getGreetingScene', () => {
  it.each([
    [5, 'morning'],
    [10, 'morning'],
    [11, 'afternoon'],
    [16, 'afternoon'],
    [17, 'evening'],
    [21, 'evening'],
    [22, 'night'],
    [23, 'night'],
    [0, 'night'],
    [4, 'night'],
  ] as const)('%i giờ → %s', (hour, expected) => {
    expect(getGreetingScene(hour)).toBe(expected);
  });

  it('mốc trái TÍNH, mốc phải KHÔNG: 10:59 vẫn là sáng, 11:00 đã là chiều', () => {
    expect(getGreetingScene(10.99)).toBe('morning');
    expect(getGreetingScene(11)).toBe('afternoon');
  });

  it('giờ ngoài 0–23 (dữ liệu hỏng) không ném lỗi, rơi về đêm', () => {
    expect(getGreetingScene(-1)).toBe('night');
    expect(getGreetingScene(99)).toBe('night');
    expect(getGreetingScene(Number.NaN)).toBe('night');
  });
});
