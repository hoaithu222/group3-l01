import { render, userEvent } from '@testing-library/react-native';

import type { GanttDto, GanttTaskDto } from '../api/critical-path.types';
import { GanttChart } from '../components/gantt/GanttChart';

const HIDDEN = { includeHiddenElements: true } as const;

// Khoảng 22/09 → 05/10/2026 theo giờ Việt Nam.
const FROM = '2026-09-21T17:00:00.000Z';
const TO = '2026-10-04T17:00:00.000Z';

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

const DATA: GanttDto = {
  edges: [{ predecessorId: 'a', slackDays: -1, successorId: 'b' }],
  from: FROM,
  tasks: [
    task({ dueDate: '2026-09-25T05:00:00.000Z', id: 'a', isCritical: true, startDate: '2026-09-23T05:00:00.000Z', title: 'Thiết kế' }),
    task({ blockedByCount: 1, conflict: true, dueDate: '2026-09-29T05:00:00.000Z', id: 'b', isCritical: true, startDate: '2026-09-24T05:00:00.000Z', title: 'Lập trình' }),
    task({ columnKind: 'DONE', dueDate: '2026-09-27T05:00:00.000Z', id: 'c', title: 'Đã xong' }),
  ],
  timezone: 'Asia/Ho_Chi_Minh',
  to: TO,
  truncated: false,
};

function renderChart(canDrag = true) {
  const handlers = { onOpenBar: jest.fn(), onShift: jest.fn() };
  return { handlers, view: render(<GanttChart canDrag={canDrag} data={DATA} rangeKey="month" {...handlers} />) };
}

describe('GanttChart (tablet)', () => {
  it('vẽ trục ngày và MỖI thẻ một thanh có nhãn đọc: tên, ngày, trạng thái bằng CHỮ', async () => {
    const screen = await renderChart().view;

    // Trục và dòng tên là trang trí (thanh bên dưới đã mang nhãn đọc đủ) nên ẩn khỏi cây trợ năng: tìm cả phần tử ẩn.
    expect(screen.getByText('Tháng 09/2026', HIDDEN)).toBeOnTheScreen();
    expect(screen.getByLabelText('Thiết kế. Bắt đầu 23/09/2026, Hạn 25/09/2026. Đường găng')).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Lập trình\..*Xung đột lịch\. Đường găng\. Bị chặn bởi Thiết kế \(chưa xong\)$/)).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Đã xong\..*Hoàn thành$/)).toBeOnTheScreen();
  });

  it('tên thẻ xung đột/đường găng có hậu tố CHỮ trên dòng tên (không chỉ màu thanh)', async () => {
    const screen = await renderChart().view;

    expect(screen.getByText('Lập trình · Xung đột lịch · Đường găng', HIDDEN)).toBeOnTheScreen();
    expect(screen.getByText('Thiết kế · Đường găng', HIDDEN)).toBeOnTheScreen();
    expect(screen.getByText('Đã xong', HIDDEN)).toBeOnTheScreen();
  });

  it('chạm thanh gọi onOpenBar với đúng thẻ (đường thay thế cho kéo)', async () => {
    const { handlers, view } = renderChart();
    const screen = await view;

    await userEvent.press(screen.getByLabelText(/^Thiết kế\./));
    expect(handlers.onOpenBar).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenBar.mock.calls[0]?.[0]).toMatchObject({ id: 'a' });
  });

  it('gợi ý trợ năng của thanh theo quyền: kéo được thì nói "Giữ rồi kéo", chỉ đọc thì "Chạm để mở thẻ"', async () => {
    const editable = await renderChart(true).view;
    expect(editable.getAllByLabelText(/^Thiết kế\./)[0]?.props.accessibilityHint).toMatch(/Giữ rồi kéo/);
  });

  it('chỉ đọc: gợi ý "Chạm để mở thẻ", không nhắc kéo', async () => {
    const screen = await renderChart(false).view;
    expect(screen.getByLabelText(/^Thiết kế\./).props.accessibilityHint).toBe('Chạm để mở thẻ');
  });

  it('mũi tên phụ thuộc là TRANG TRÍ: có lớp SVG, ẩn khỏi trình đọc màn hình và không nhận chạm', async () => {
    const screen = await renderChart().view;
    const arrows = screen.getByTestId('gantt-arrows', HIDDEN);

    expect(arrows.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(arrows.props.accessibilityElementsHidden).toBe(true);
  });
});
