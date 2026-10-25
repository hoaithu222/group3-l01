import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { RescheduleBatchDto } from '../api/critical-path.types';
import { rescheduleService } from '../api/reschedule.service';
import { RescheduleBanner } from '../components/kanban/RescheduleBanner';
import { boardKeys } from '../queries/boards.keys';

jest.mock('../api/reschedule.service', () => ({
  rescheduleService: { apply: jest.fn(), batch: jest.fn(), preview: jest.fn() },
}));

const batch = rescheduleService.batch as jest.MockedFunction<typeof rescheduleService.batch>;

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function dto(overrides: Partial<RescheduleBatchDto>): RescheduleBatchDto {
  return {
    affectedCount: 250,
    appliedCount: 0,
    conflictCount: 0,
    conflicts: [],
    createdAt: '2026-09-25T00:00:00.000Z',
    finishedAt: null,
    id: 'batch-1',
    status: 'RUNNING',
    ...overrides,
  };
}

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  const props = { batchId: 'batch-1', boardId: 'b1', onDismiss: jest.fn(), onOpenTask: jest.fn() };
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return { props, queryClient, view: () => render(<RescheduleBanner {...props} />, { wrapper: Wrapper }) };
}

beforeEach(() => jest.clearAllMocks());

describe('RescheduleBanner', () => {
  it('202 → lô đang chạy: "Đang dời lịch 250 thẻ…" kèm tiến độ, KHÔNG có nút đóng', async () => {
    batch.mockResolvedValue(dto({ appliedCount: 120 }));
    const { view } = setup();
    const screen = await view();

    expect(await screen.findByText('Đang dời lịch 250 thẻ… (120/250)')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Đóng thông báo')).toBeNull();
  });

  it('trước khi có dữ liệu vẫn nói "Đang dời lịch…" (chưa biết ≠ đã xong)', async () => {
    batch.mockReturnValue(new Promise(() => undefined));
    const { view } = setup();
    const screen = await view();

    expect(screen.getByText('Đang dời lịch…')).toBeOnTheScreen();
  });

  it('lô PARTIAL: "1 xung đột" + "Xem chi tiết" mở danh sách thẻ chưa dời được; chạm một thẻ mở nó', async () => {
    batch.mockResolvedValue(
      dto({
        appliedCount: 249,
        conflictCount: 1,
        conflicts: [{ taskId: 'tx', title: 'Thẻ bị sửa giữa lô' }],
        status: 'PARTIAL',
      }),
    );
    const { props, view } = setup();
    const screen = await view();

    expect(await screen.findByText('Đã dời 249 thẻ, 1 xung đột')).toBeOnTheScreen();
    await userEvent.press(screen.getByText('Xem chi tiết'));
    expect(await screen.findByText('1 thẻ chưa dời được')).toBeOnTheScreen();

    await userEvent.press(screen.getByText('Thẻ bị sửa giữa lô'));
    expect(props.onOpenTask).toHaveBeenCalledWith('tx');
  });

  it('lô DONE: kết quả, không có "Xem chi tiết", đóng được', async () => {
    batch.mockResolvedValue(dto({ appliedCount: 250, status: 'DONE' }));
    const { props, view } = setup();
    const screen = await view();

    expect(await screen.findByText('Đã dời 250 thẻ')).toBeOnTheScreen();
    expect(screen.queryByText('Xem chi tiết')).toBeNull();
    await userEvent.press(screen.getByLabelText('Đóng thông báo'));
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('lô FAILED: nói rõ không hoàn tất', async () => {
    batch.mockResolvedValue(dto({ status: 'FAILED' }));
    const { view } = setup();
    const screen = await view();

    expect(await screen.findByText(/không hoàn tất/)).toBeOnTheScreen();
  });

  it('không tra được lô (404/mất quyền): cảnh báo đóng được thay vì treo "đang dời" mãi', async () => {
    batch.mockRejectedValue(new Error('404'));
    const { props, view } = setup();
    const screen = await view();

    await waitFor(() => expect(screen.getByText('Không kiểm tra được tiến độ dời lịch.')).toBeOnTheScreen());
    await userEvent.press(screen.getByLabelText('Đóng thông báo'));
    expect(props.onDismiss).toHaveBeenCalled();
  });

  it('khoá query của lô nằm trong không gian `boards` (logout dọn cùng tiền tố)', () => {
    expect(boardKeys.rescheduleBatch('batch-1')).toEqual(['boards', 'reschedule-batch', 'batch-1']);
  });
});
