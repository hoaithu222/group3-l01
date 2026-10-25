import type { GanttEdgeDto } from '../api/critical-path.types';
import { arrowHeadPath, arrowPath, barRect, visibleEdges } from '../utils/gantt-arrows';
import { barGeometry, buildTimeline } from '../utils/gantt-layout';

const TZ = 'Asia/Ho_Chi_Minh';
const ROW = { height: 48, index: 2 };
const RANGE = { from: '2026-09-21T17:00:00.000Z', to: '2026-10-04T17:00:00.000Z' };
const timeline = buildTimeline(RANGE, TZ, 40);

describe('mũi tên phụ thuộc', () => {
  const from = { height: 28, width: 80, x: 40, y: 18 };
  const farTo = { height: 28, width: 80, x: 300, y: 66 };

  it('đủ chỗ: nối ĐÚNG mép phải thanh trước → mép trái thanh sau, gập khuỷu ở giữa', () => {
    const path = arrowPath(from, farTo, 10);
    const startX = from.x + from.width;
    const startY = from.y + from.height / 2;
    expect(path.startsWith(`M ${startX} ${startY}`)).toBe(true);
    expect(path.endsWith(`H ${farTo.x}`)).toBe(true);
    expect(path).toContain(`V ${farTo.y + farTo.height / 2}`);
  });

  it('xung đột (thẻ sau bắt đầu SỚM hơn hạn thẻ trước): vòng qua khe giữa hai hàng, vẫn chạm đúng hai mép', () => {
    const early = { height: 28, width: 80, x: 60, y: 66 };
    const path = arrowPath(from, early, 10);
    expect(path.startsWith('M 120 32')).toBe(true);
    expect(path.endsWith(`H ${early.x}`)).toBe(true);
    // khe ngay dưới hàng thẻ trước (y = 18 + 28)
    expect(path).toContain('V 46');
  });

  it('thẻ sau nằm hàng TRÊN: khe đi qua mép trên thanh trước', () => {
    const above = { height: 28, width: 80, x: 60, y: -30 };
    expect(arrowPath(from, above, 10)).toContain('V 18');
  });

  it('đầu mũi tên nhọn tại đúng điểm chạm', () => {
    expect(arrowHeadPath(100, 50, 5)).toBe('M 100 50 L 95 45 L 95 55 Z');
  });

  it('barRect lệch xuống dưới dòng tên nhưng giữ x/bề rộng', () => {
    const geometry = barGeometry({ dueDate: '2026-09-25T05:00:00.000Z', startDate: null }, timeline, TZ, ROW);
    expect(geometry).not.toBeNull();
    const rect = barRect(geometry!, 18, 28);
    expect(rect).toMatchObject({ height: 28, width: geometry!.width, x: geometry!.x, y: geometry!.y + 18 });
  });

  it('visibleEdges: giữ cạnh có ÍT NHẤT một đầu trong dải hàng đang vẽ', () => {
    const edges: GanttEdgeDto[] = [
      { predecessorId: 'a', slackDays: 0, successorId: 'b' },
      { predecessorId: 'c', slackDays: 1, successorId: 'd' },
      { predecessorId: 'a', slackDays: 1, successorId: 'd' },
    ];
    const rows = new Map([
      ['a', 0],
      ['b', 1],
      ['c', 8],
      ['d', 9],
    ]);
    const kept = visibleEdges(edges, rows, { first: 0, last: 2 });
    expect(kept.map((edge) => `${edge.predecessorId}>${edge.successorId}`)).toEqual(['a>b', 'a>d']);
  });
});
