import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, userEvent } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { GanttDto, GanttTaskDto } from '../api/critical-path.types';
import { MilestoneList } from '../components/gantt/MilestoneList';
import { boardKeys } from '../queries/boards.keys';
import { makeData, makeTask } from './fixtures';

// Thư viện thật là ESM thuần nên Jest không nạp được — xem tests/mocks/fractional-indexing.ts.
jest.mock('fractional-indexing', () => jest.requireActual('./mocks/fractional-indexing'));

function gantt(overrides: Partial<GanttTaskDto> & Pick<GanttTaskDto, 'id'>): GanttTaskDto {
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
  edges: [{ predecessorId: 't1', slackDays: -1, successorId: 't2' }],
  from: '2026-09-20T17:00:00.000Z',
  tasks: [
    gantt({ assigneeIds: ['u-lan'], columnKind: 'IN_PROGRESS', dueDate: '2026-09-24T05:00:00.000Z', id: 't1', isCritical: true, title: 'Viết báo cáo' }),
    gantt({ blockedByCount: 1, conflict: true, dueDate: '2026-09-30T05:00:00.000Z', id: 't2', isCritical: true, startDate: '2026-09-23T05:00:00.000Z', title: 'Nộp báo cáo' }),
    gantt({ assigneeIds: ['u1', 'u2'], columnKind: 'DONE', dueDate: '2026-09-25T05:00:00.000Z', id: 't3', title: 'Đã xong' }),
  ],
  timezone: 'Asia/Ho_Chi_Minh',
  to: '2026-10-31T17:00:00.000Z',
  truncated: false,
};

function renderList(onOpenTask = jest.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  const cards = makeData();
  cards.columns.c_todo = [makeTask({ assignees: [{ avatarUrl: null, id: 'u-lan', name: 'Lan' }], id: 't1', position: 'a0' })];
  queryClient.setQueryData(boardKeys.tasks('b1', {}), cards);
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { onOpenTask, view: render(<MilestoneList boardId="b1" data={DATA} onOpenTask={onOpenTask} />, { wrapper: Wrapper }) };
}

describe('MilestoneList — danh sách mốc của điện thoại', () => {
  it('nhóm theo TUẦN của hạn chót, tiêu đề tuần có khoảng ngày', async () => {
    const screen = await renderList().view;

    // Tuần chứa hôm nay được ghi thêm "Tuần này" (phụ thuộc đồng hồ) nên so khớp phần khoảng ngày.
    expect(screen.getByText(/^Tuần 21\/09 – 27\/09/)).toBeOnTheScreen();
    expect(screen.getByText(/^Tuần 28\/09 – 04\/10/)).toBeOnTheScreen();
    expect(screen.getByText('Viết báo cáo')).toBeOnTheScreen();
    expect(screen.getByText('Nộp báo cáo')).toBeOnTheScreen();
  });

  it('chip trạng thái có CHỮ: đường găng, xung đột lịch, "Bị chặn bởi A (chưa xong)"', async () => {
    const screen = await renderList().view;

    expect(screen.getAllByText('Đường găng').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Xung đột lịch')).toBeOnTheScreen();
    expect(screen.getByText('Bị chặn bởi Viết báo cáo (chưa xong)')).toBeOnTheScreen();
    expect(screen.getByText('Hoàn thành')).toBeOnTheScreen();
  });

  it('người làm tra từ cache bảng; không tra được thì nói số người', async () => {
    const screen = await renderList().view;

    expect(screen.getByText('Người làm: Lan')).toBeOnTheScreen();
    expect(screen.getByText('Người làm: 2 người')).toBeOnTheScreen();
  });

  it('ngày hiển thị theo múi giờ của server (hạn 24/09 giờ Việt Nam)', async () => {
    const screen = await renderList().view;
    expect(screen.getByText('Hạn 24/09/2026')).toBeOnTheScreen();
  });

  it('chạm một thẻ mở chi tiết thẻ đó', async () => {
    const { onOpenTask, view } = renderList();
    const screen = await view;

    await userEvent.press(screen.getByText('Nộp báo cáo'));
    expect(onOpenTask).toHaveBeenCalledWith('t2');
  });

  it('nhãn đọc gộp ngày + trạng thái', async () => {
    const screen = await renderList().view;
    expect(screen.getByLabelText(/Nộp báo cáo\..*Xung đột lịch\. Đường găng\. Bị chặn bởi Viết báo cáo/)).toBeOnTheScreen();
  });
});
