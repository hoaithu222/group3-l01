import type { GanttTaskDto } from '../api/critical-path.types';
import {
  barGeometry,
  buildTimeline,
  indexOfDay,
  sortGanttTasks,
  visibleRowRange,
  xOfDay,
} from '../utils/gantt-layout';
import { dayNumberIn } from '../utils/zoned-date';

const TZ = 'Asia/Ho_Chi_Minh';
const ROW = { height: 48, index: 2 };

// Khoảng 22/09 → 05/10/2026 (14 ngày) theo giờ Việt Nam; 40dp mỗi ngày.
const RANGE = { from: '2026-09-21T17:00:00.000Z', to: '2026-10-04T17:00:00.000Z' };
const timeline = buildTimeline(RANGE, TZ, 40);

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

describe('buildTimeline / ngày → x', () => {
  it('số cột = số ngày LỊCH trong múi giờ server, bao gồm cả hai đầu', () => {
    expect(timeline.days).toBe(14);
    expect(timeline.width).toBe(14 * 40);
    expect(xOfDay(timeline, 3)).toBe(120);
  });

  it('cùng một khoảnh khắc rơi vào NGÀY khác nhau tuỳ múi giờ (23:30 UTC = 06:30 hôm sau ở Việt Nam)', () => {
    const iso = '2026-09-24T23:30:00.000Z';
    expect(dayNumberIn(iso, 'UTC')).toBe(dayNumberIn('2026-09-24T00:00:00.000Z', 'UTC'));
    expect(dayNumberIn(iso, TZ)).toBe(dayNumberIn(iso, 'UTC') + 1);
  });

  it('múi giờ hỏng không ném lỗi — rơi về giờ máy', () => {
    expect(() => dayNumberIn('2026-09-24T10:00:00.000Z', 'Khong/CoThat')).not.toThrow();
  });
});

describe('barGeometry', () => {
  it('thanh nối ngày bắt đầu → hạn chót, mép phải BAO GỒM ngày hạn', () => {
    // 24/09 → 26/09 (giờ VN) = cột 2..4
    const bar = barGeometry(
      { dueDate: '2026-09-26T16:59:59.000Z', startDate: '2026-09-23T17:00:00.000Z' },
      timeline,
      TZ,
      ROW,
    );
    expect(bar).toMatchObject({ endIndex: 4, startIndex: 2, width: 3 * 40, x: 80, y: 96 });
    expect(bar?.clippedStart).toBe(false);
    expect(bar?.clippedEnd).toBe(false);
  });

  it('thẻ chỉ có một ngày → thanh MỘT ô (cột mốc)', () => {
    const bar = barGeometry({ dueDate: '2026-09-25T05:00:00.000Z', startDate: null }, timeline, TZ, ROW);
    expect(bar?.width).toBe(40);
  });

  it('thẻ kéo dài ra ngoài khoảng bị CẮT ở mép và đánh dấu clipped', () => {
    const bar = barGeometry(
      { dueDate: '2026-10-20T05:00:00.000Z', startDate: '2026-09-10T05:00:00.000Z' },
      timeline,
      TZ,
      ROW,
    );
    expect(bar).toMatchObject({ clippedEnd: true, clippedStart: true, endIndex: 13, startIndex: 0 });
    expect(bar?.width).toBe(timeline.width);
  });

  it('nằm hẳn ngoài khoảng hoặc không có ngày → null', () => {
    expect(barGeometry({ dueDate: '2026-12-01T00:00:00.000Z', startDate: null }, timeline, TZ, ROW)).toBeNull();
    expect(barGeometry({ dueDate: null, startDate: null }, timeline, TZ, ROW)).toBeNull();
  });

  it('hạn TRƯỚC ngày bắt đầu (dữ liệu hỏng) không cho bề rộng âm', () => {
    const bar = barGeometry(
      { dueDate: '2026-09-23T05:00:00.000Z', startDate: '2026-09-26T05:00:00.000Z' },
      timeline,
      TZ,
      ROW,
    );
    expect(bar?.width).toBe(40);
  });

  it('indexOfDay khớp thứ tự cột', () => {
    expect(indexOfDay(timeline, timeline.fromDay + 5)).toBe(5);
  });
});

describe('visibleRowRange — ảo hoá theo vùng nhìn thấy', () => {
  const base = { overscan: 2, rowCount: 100, rowHeight: 48, viewportHeight: 480 };

  it('đầu danh sách: từ hàng 0, cắt theo chiều cao + overscan', () => {
    expect(visibleRowRange({ ...base, scrollY: 0 })).toEqual({ first: 0, last: 12 });
  });

  it('cuộn giữa: cắt cả hai phía', () => {
    expect(visibleRowRange({ ...base, scrollY: 960 })).toEqual({ first: 18, last: 32 });
  });

  it('cuối danh sách không vượt số hàng; ít hàng hơn viewport thì vẽ hết', () => {
    expect(visibleRowRange({ ...base, scrollY: 99_999 }).last).toBe(99);
    expect(visibleRowRange({ ...base, rowCount: 3, scrollY: 0 })).toEqual({ first: 0, last: 2 });
  });

  it('không có hàng → dải RỖNG (first > last) để vòng lặp không chạy', () => {
    const range = visibleRowRange({ ...base, rowCount: 0, scrollY: 0 });
    expect(range.first).toBeGreaterThan(range.last);
  });
});

describe('sortGanttTasks', () => {
  it('theo ngày bắt đầu (không có thì hạn), rồi tiêu đề; không đổi mảng gốc', () => {
    const input = [
      task({ dueDate: '2026-09-30T00:00:00.000Z', id: 'c' }),
      task({ id: 'b', startDate: '2026-09-22T00:00:00.000Z', title: 'B' }),
      task({ id: 'a', startDate: '2026-09-22T00:00:00.000Z', title: 'A' }),
    ];
    expect(sortGanttTasks(input).map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(input[0]?.id).toBe('c');
  });

  it('có thứ tự cột ⇒ nhóm theo cột trước, trong cột theo ngày; thiếu columnId/cột lạ xếp cuối', () => {
    const input = [
      task({ columnId: 'c_doing', id: 'd', startDate: '2026-09-20T00:00:00.000Z' }),
      task({ id: 'x', startDate: '2026-09-01T00:00:00.000Z' }),
      task({ columnId: 'c_todo', id: 't2', startDate: '2026-09-25T00:00:00.000Z' }),
      task({ columnId: 'c_todo', id: 't1', startDate: '2026-09-21T00:00:00.000Z' }),
    ];
    expect(sortGanttTasks(input, ['c_todo', 'c_doing']).map((item) => item.id)).toEqual(['t1', 't2', 'd', 'x']);
  });
});
