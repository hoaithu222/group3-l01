import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ChecklistResult } from '../api/task-detail.types';
import { taskChecklistService } from '../api/task-checklist.service';
import { ChecklistSection } from '../components/task/ChecklistSection';
import { taskKeys } from '../queries/task-detail.keys';
import { boardKeys } from '../queries/boards.keys';
import { makeData } from './fixtures';
import { makeDetail, makeItem } from './detail-fixtures';

// Thư viện thật là ESM thuần nên Jest không nạp được — xem tests/mocks/fractional-indexing.ts.
jest.mock('fractional-indexing', () => jest.requireActual('./mocks/fractional-indexing'));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/task-checklist.service', () => ({
  taskChecklistService: { add: jest.fn(), patch: jest.fn(), remove: jest.fn() },
}));

const patch = taskChecklistService.patch as jest.MockedFunction<typeof taskChecklistService.patch>;
const add = taskChecklistService.add as jest.MockedFunction<typeof taskChecklistService.add>;

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

/** Đọc `detail` từ cache như màn thật (`useTaskDetail`) — không gọi mạng vì dữ liệu còn tươi. */
function Harness({ canEdit = true }: { canEdit?: boolean }) {
  const { data } = useQuery({
    queryFn: () => Promise.resolve(makeDetail()),
    queryKey: taskKeys.detail('t1'),
    staleTime: Infinity,
  });
  if (!data) return null;
  return (
    <ChecklistSection
      boardId="b1"
      canEdit={canEdit}
      checklist={data.checklist}
      done={data.checklistDone}
      taskId="t1"
      total={data.checklistTotal}
    />
  );
}

function setup(canEdit = true) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { gcTime: Infinity, retry: false }, queries: { gcTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(taskKeys.detail('t1'), makeDetail());
  queryClient.setQueryData(boardKeys.tasks('b1', {}), makeData());
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return { queryClient, ui: <Harness canEdit={canEdit} />, Wrapper };
}

function result(overrides: Partial<ChecklistResult>): ChecklistResult {
  return { checklistDone: 2, checklistTotal: 4, item: makeItem({ done: true, id: 'i2' }), version: 2, ...overrides };
}

beforeEach(() => jest.clearAllMocks());

describe('ChecklistSection', () => {
  it('tick mục thứ hai cập nhật "2/4 · 50 %" NGAY, trước khi máy chủ trả lời (PM2-02 phía client)', async () => {
    let resolve: (value: ChecklistResult) => void = () => undefined;
    patch.mockReturnValue(new Promise((done) => (resolve = done)));
    const { Wrapper, ui } = setup();
    await render(ui, { wrapper: Wrapper });
    expect(screen.getByText('1/4 · 25 %')).toBeOnTheScreen();

    await userEvent.press(screen.getByLabelText('Việc i2'));

    // Máy chủ CHƯA trả lời mà số đã đổi.
    expect(screen.getByText('2/4 · 50 %')).toBeOnTheScreen();
    expect(patch).toHaveBeenCalledWith('t1', 'i2', { done: true });

    resolve(result({}));
    await waitFor(() => expect(screen.getByText('2/4 · 50 %')).toBeOnTheScreen());
  });

  it('máy chủ từ chối ⇒ hoàn tác về "1/4 · 25 %"', async () => {
    patch.mockRejectedValue(new Error('mạng'));
    const { Wrapper, ui } = setup();
    await render(ui, { wrapper: Wrapper });

    await userEvent.press(screen.getByLabelText('Việc i2'));

    await waitFor(() => expect(screen.getByText('1/4 · 25 %')).toBeOnTheScreen());
  });

  it('thêm mục: gửi văn bản đã cắt khoảng trắng, xoá ô nhập, mục mới hiện và tổng thành 5', async () => {
    add.mockResolvedValue(result({ checklistDone: 1, checklistTotal: 5, item: makeItem({ id: 'i5', text: 'Mục mới' }), version: 2 }));
    const { Wrapper, ui } = setup();
    await render(ui, { wrapper: Wrapper });

    await userEvent.type(screen.getByPlaceholderText('Thêm việc nhỏ'), '  Mục mới  ');
    await userEvent.press(screen.getByRole('button', { name: 'Thêm việc nhỏ' }));

    expect(add).toHaveBeenCalledWith('t1', 'Mục mới', undefined);
    await waitFor(() => expect(screen.getByText('Mục mới')).toBeOnTheScreen());
    expect(screen.getByText('1/5 · 20 %')).toBeOnTheScreen();
  });

  it('chỉ đọc (offline/không quyền): không có ô thêm mục và ô tick bị khoá', async () => {
    const { Wrapper, ui } = setup(false);
    await render(ui, { wrapper: Wrapper });

    expect(screen.queryByPlaceholderText('Thêm việc nhỏ')).toBeNull();
    await userEvent.press(screen.getByLabelText('Việc i2'));
    expect(patch).not.toHaveBeenCalled();
  });
});

