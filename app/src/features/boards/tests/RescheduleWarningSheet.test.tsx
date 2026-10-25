import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, userEvent } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ReschedulePreviewDto } from '../api/critical-path.types';
import { RescheduleWarningSheet } from '../components/task/RescheduleWarningSheet';
import type { RescheduleController, RescheduleSession } from '../hooks/useReschedule';
import { boardKeys } from '../queries/boards.keys';
import { makeData, makeTask } from './fixtures';

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function preview(overrides: Partial<ReschedulePreviewDto> = {}): ReschedulePreviewDto {
  return {
    affected: [
      {
        assigneeIds: ['u-lan'],
        newDueDate: '2026-09-28T05:00:00.000Z',
        newStartDate: null,
        oldDueDate: '2026-09-25T05:00:00.000Z',
        oldStartDate: null,
        shiftDays: 3,
        taskId: 't2',
        title: 'Viết báo cáo',
      },
    ],
    affectedCount: 1,
    mode: 'SYNC',
    previewToken: 'a'.repeat(64),
    skipped: [],
    source: { newDueDate: '2026-09-27T05:00:00.000Z', oldDueDate: null, taskId: 't1', version: 3 },
    timezone: 'Asia/Ho_Chi_Minh',
    truncated: false,
    ...overrides,
  };
}

function controller(
  session: Partial<RescheduleSession> | null,
  overrides: Partial<RescheduleController> = {},
): RescheduleController {
  return {
    applying: false,
    begin: jest.fn(),
    cancel: jest.fn(),
    confirm: jest.fn(),
    session: session
      ? {
          change: { dueDate: '2026-09-27T05:00:00.000Z', startDate: null },
          error: null,
          preview: preview(),
          refreshed: false,
          taskId: 't1',
          ...session,
        }
      : null,
    ...overrides,
  };
}

async function renderSheet(value: RescheduleController) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  // Người làm được tra từ cache bảng (BE chỉ trả id).
  const data = makeData();
  data.columns.c_todo = [
    makeTask({
      assignees: [{ avatarUrl: null, id: 'u-lan', name: 'Lan' }],
      id: 't2',
      position: 'a1',
    }),
  ];
  queryClient.setQueryData(boardKeys.tasks('b1', {}), data);
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(<RescheduleWarningSheet boardId="b1" controller={value} />, { wrapper: Wrapper });
}

describe('RescheduleWarningSheet', () => {
  it('không có phiên ⇒ không hiện gì', async () => {
    const screen = await renderSheet(controller(null));
    expect(screen.queryByText('Dời lịch')).toBeNull();
  });

  it('tiêu đề đếm thẻ; mỗi thẻ có ngày cũ → mới, "+3 ngày", người làm tra từ cache', async () => {
    const screen = await renderSheet(controller({}));

    expect(screen.getByText('Việc này sẽ dời lịch của 1 thẻ khác')).toBeOnTheScreen();
    expect(screen.getByText('Viết báo cáo')).toBeOnTheScreen();
    expect(screen.getByText('25/09/2026 → 28/09/2026')).toBeOnTheScreen();
    expect(screen.getByText('+3 ngày')).toBeOnTheScreen();
    expect(screen.getByText('Người làm: Lan')).toBeOnTheScreen();
  });

  it('liệt kê THẺ KHÔNG DỜI kèm lý do, và "và N thẻ khác" khi danh sách bị cắt', async () => {
    const screen = await renderSheet(
      controller({
        preview: preview({
          affectedCount: 180,
          skipped: [
            { reason: 'DONE', taskId: 't8', title: 'Thẻ đã xong' },
            { reason: 'NO_DATES', taskId: 't9', title: 'Thẻ chưa lên lịch' },
          ],
          truncated: true,
        }),
      }),
    );

    expect(screen.getByText('Không dời')).toBeOnTheScreen();
    // Mỗi thẻ không dời là MỘT hàng: tên thẻ ở nhãn, lý do ở dòng phụ ngay dưới (không còn ghép "tên — lý do").
    expect(screen.getByText('Thẻ đã xong')).toBeOnTheScreen();
    expect(screen.getByText('Thẻ đã hoàn thành')).toBeOnTheScreen();
    expect(screen.getByText('Thẻ chưa lên lịch')).toBeOnTheScreen();
    expect(screen.getByText('Thẻ chưa có ngày')).toBeOnTheScreen();
    expect(screen.getByText('và 179 thẻ khác')).toBeOnTheScreen();
  });

  it('lô nền (BULK) có ghi chú sẽ chạy nền', async () => {
    const screen = await renderSheet(controller({ preview: preview({ mode: 'BULK' }) }));
    expect(screen.getByText(/dời chạy nền/)).toBeOnTheScreen();
  });

  it('TASK_019 (refreshed): banner "Lịch vừa thay đổi, hãy xem lại"; lỗi TASK_020 hiện trong tấm', async () => {
    const screen = await renderSheet(
      controller({ error: 'Bảng đang dời lịch, thử lại sau', refreshed: true }),
    );
    expect(screen.getByText(/Lịch vừa thay đổi, hãy xem lại/)).toBeOnTheScreen();
    expect(screen.getByText('Bảng đang dời lịch, thử lại sau')).toBeOnTheScreen();
  });

  it('bấm "Dời lịch" gọi confirm, "Huỷ" gọi cancel', async () => {
    const value = controller({});
    const screen = await renderSheet(value);

    await userEvent.press(screen.getByText('Dời lịch'));
    expect(value.confirm).toHaveBeenCalledTimes(1);
    expect(value.cancel).not.toHaveBeenCalled();

    await userEvent.press(screen.getByText('Huỷ'));
    expect(value.cancel).toHaveBeenCalledTimes(1);
  });

  it('đang áp: nút Huỷ bị khoá (không đóng giữa chừng)', async () => {
    const value = controller({}, { applying: true });
    const screen = await renderSheet(value);

    await userEvent.press(screen.getByText('Huỷ'));
    expect(value.cancel).not.toHaveBeenCalled();
  });
});
