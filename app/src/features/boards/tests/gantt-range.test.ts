import type { GanttTaskDto } from '../api/critical-path.types';
import { ganttRangeFor, ganttRangeStorageKey, isGanttRangeKey } from '../utils/gantt-range';
import { shiftChange } from '../utils/gantt-shift';
import { groupByWeek, weekStartOf } from '../utils/milestone-groups';
import { dayNumberIn, dayParts, differsFromDevice } from '../utils/zoned-date';

const TZ = 'Asia/Ho_Chi_Minh';

function task(overrides: Partial<GanttTaskDto> & Pick<GanttTaskDto, 'id'>): GanttTaskDto {
  return {
    assigneeIds: [],
    blockedByCount: 0,
    columnKind: 'TODO',
    conflict: false,
    dueDate: null,
    isCritical: false,
    slackDays: null,
    startDate: null,
    title: `Thẻ ${overrides.id}`,
    ...overrides,
  };
}

describe('ganttRangeFor', () => {
  // Thứ Sáu 25/09/2026, giữa trưa để múi giờ máy chạy test không đẩy sang ngày khác.
  const today = new Date(2026, 8, 25, 12, 0, 0);

  it('2 tuần: từ thứ Hai của tuần này, dài 14 ngày', () => {
    const range = ganttRangeFor('2w', today);
    const from = new Date(range.from);
    expect(from.getDay()).toBe(1);
    expect(from.getDate()).toBe(21);
    expect(Math.round((new Date(range.to).getTime() - from.getTime()) / 86_400_000)).toBe(14);
  });

  it('Chủ nhật vẫn thuộc tuần TRƯỚC (thứ Hai là đầu tuần)', () => {
    const sunday = new Date(2026, 8, 27, 12, 0, 0);
    expect(new Date(ganttRangeFor('2w', sunday).from).getDate()).toBe(21);
  });

  it('tháng / quý: bắt đầu từ mùng 1, ≤ 92 ngày (dưới trần 366 của BE)', () => {
    const month = ganttRangeFor('month', today);
    const quarter = ganttRangeFor('quarter', today);
    expect(new Date(month.from).getDate()).toBe(1);
    expect(new Date(month.to).getMonth()).toBe(9);
    const days = (new Date(quarter.to).getTime() - new Date(quarter.from).getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(80);
    expect(days).toBeLessThanOrEqual(92);
  });

  it('khoá lưu theo người dùng + bảng; chỉ nhận ba mức hợp lệ', () => {
    expect(ganttRangeStorageKey('u1', 'b1')).toBe('boards:gantt-range:u1:b1');
    expect(isGanttRangeKey('month')).toBe(true);
    expect(isGanttRangeKey('year')).toBe(false);
    expect(isGanttRangeKey(null)).toBe(false);
  });
});

describe('zoned-date', () => {
  it('dayParts: thứ Hai = 0, 2026-09-21 là thứ Hai', () => {
    const monday = dayParts(dayNumberIn('2026-09-21T05:00:00.000Z', 'UTC'));
    expect(monday).toMatchObject({ date: 21, month: 9, weekday: 0, year: 2026 });
    expect(dayParts(dayNumberIn('2026-09-27T05:00:00.000Z', 'UTC')).weekday).toBe(6);
  });

  it('differsFromDevice: UTC+7 luôn lệch một máy ở UTC+0 (và ngược lại), giống nhau thì false', () => {
    const now = new Date('2026-09-25T00:00:00.000Z');
    const offset = -new Date(now).getTimezoneOffset();
    expect(differsFromDevice('Asia/Ho_Chi_Minh', now)).toBe(offset !== 420);
    expect(differsFromDevice('Khong/CoThat', now)).toBe(false);
  });
});

describe('groupByWeek — danh sách mốc của điện thoại', () => {
  const now = new Date('2026-09-25T05:00:00.000Z');
  const tasks = [
    task({ dueDate: '2026-09-30T05:00:00.000Z', id: 'c', title: 'C' }),
    task({ dueDate: '2026-09-22T05:00:00.000Z', id: 'a', title: 'A' }),
    task({ id: 'b', startDate: '2026-09-23T05:00:00.000Z', title: 'B' }),
    task({ id: 'none' }),
  ];

  it('nhóm theo tuần (thứ Hai → Chủ nhật) của hạn chót, không có hạn thì ngày bắt đầu; tuần tăng dần', () => {
    const sections = groupByWeek(tasks, TZ, now);
    expect(sections.map((section) => section.data.map((item) => item.id))).toEqual([['a', 'b'], ['c']]);
    expect(sections[0]?.title).toBe('Tuần 21/09 – 27/09');
    expect(sections[1]?.title).toBe('Tuần 28/09 – 04/10');
  });

  it('đánh dấu tuần chứa hôm nay; thẻ không có ngày bị bỏ, không tạo section rỗng', () => {
    const sections = groupByWeek(tasks, TZ, now);
    expect(sections.map((section) => section.isCurrent)).toEqual([true, false]);
    expect(sections.flatMap((section) => section.data).some((item) => item.id === 'none')).toBe(false);
  });

  it('khoá section là chuỗi (SectionList đòi string); weekStartOf luôn rơi vào thứ Hai', () => {
    const [first] = groupByWeek(tasks, TZ, now);
    expect(typeof first?.key).toBe('string');
    for (let day = 20_000; day < 20_010; day += 1) expect(dayParts(weekStartOf(day)).weekday).toBe(0);
  });
});

describe('shiftChange — kéo thanh Gantt', () => {
  const both = { dueDate: '2026-09-25T05:00:00.000Z', startDate: '2026-09-22T05:00:00.000Z' };

  it('move: dời CẢ HAI ngày cùng số ngày, giữ giờ trong ngày', () => {
    const change = shiftChange(both, 'move', 2);
    expect(new Date(change?.dueDate ?? '').getDate()).toBe(new Date(both.dueDate).getDate() + 2);
    expect(new Date(change?.startDate ?? '').getDate()).toBe(new Date(both.startDate).getDate() + 2);
  });

  it('resize: chỉ đổi hạn chót, ngày bắt đầu giữ NGUYÊN', () => {
    const change = shiftChange(both, 'resize', -1);
    expect(change?.startDate).toBe(both.startDate);
    expect(new Date(change?.dueDate ?? '').getDate()).toBe(new Date(both.dueDate).getDate() - 1);
  });

  it('thẻ chỉ có hạn chót: move dời hạn, ngày bắt đầu vẫn null', () => {
    expect(shiftChange({ dueDate: both.dueDate, startDate: null }, 'move', 1)?.startDate).toBeNull();
  });

  it('không có hạn chót (chỉ ngày bắt đầu) hoặc days = 0 → null, không gọi API', () => {
    expect(shiftChange({ dueDate: null, startDate: both.startDate }, 'move', 1)).toBeNull();
    expect(shiftChange(both, 'move', 0)).toBeNull();
  });
});
