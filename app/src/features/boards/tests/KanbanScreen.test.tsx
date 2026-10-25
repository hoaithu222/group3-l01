import { render, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { KanbanScreen } from '../screens/KanbanScreen';
import { useKanbanBoard } from '../hooks/useKanbanBoard';
import { READ_ONLY_PERMISSIONS, resolveBoardPermissions } from '../utils/board-permissions';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ boardId: 'b1', wsId: 'w1' }),
}));
jest.mock('../hooks/useKanbanBoard', () => ({ useKanbanBoard: jest.fn() }));
// Phần nặng (FlashList, cử chỉ, sheet) không phải đối tượng của test này — có test riêng.
jest.mock('../components/kanban/KanbanPager', () => ({ KanbanPager: () => null }));
jest.mock('../components/kanban/drag/DragOverlay', () => ({ DragOverlay: () => null }));
jest.mock('../components/kanban/drag/DragProvider', () => ({
  DragProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('../components/MoveTaskSheet', () => ({ MoveTaskSheet: () => null }));
jest.mock('../components/BoardFilterBar', () => ({ BoardFilterBar: () => null }));
// p4-04: banner lô dời lịch có hook React Query riêng — có test riêng (`RescheduleBanner.test.tsx`).
jest.mock('../components/kanban/RescheduleBanner', () => {
  const { Text } = jest.requireActual('react-native');
  return { RescheduleBanner: ({ batchId }: { batchId: string }) => <Text>{`BANNER ${batchId}`}</Text> };
});

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};
const Wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
);

const mockedUseKanban = useKanbanBoard as jest.MockedFunction<typeof useKanbanBoard>;
const openSettings = jest.fn();
const openTimeline = jest.fn();

function mockBoard(myPermissions: string[], overrides: Record<string, unknown> = {}) {
  mockedUseKanban.mockReturnValue({
    archived: false,
    board: { data: { name: 'Đồ án', version: 1 }, error: null, isError: false, isLoading: false, refetch: jest.fn() },
    canCreate: true,
    canMove: true,
    columns: [],
    dragEnabled: true,
    dragWithinColumnOnly: false,
    filterState: { chips: {}, filter: {}, patch: jest.fn(), ready: true, reset: jest.fn(), setQuery: jest.fn() },
    hasMore: {},
    labelList: [],
    labels: new Map(),
    menuTask: null,
    offline: false,
    openSettings,
    openTimeline,
    permissions: resolveBoardPermissions(myPermissions),
    setMenuTask: jest.fn(),
    tasks: { data: { columns: {}, hasMore: {} }, error: null, isError: false, refetch: jest.fn() },
    tasksByColumn: {},
    ...overrides,
  } as never);
}

beforeEach(() => jest.clearAllMocks());

describe('KanbanScreen', () => {
  it('OWNER/ADMIN (BOARD_EDIT) thấy nút "Cài đặt bảng" và bấm được', async () => {
    mockBoard(['BOARD_EDIT', 'TASK_CREATE', 'TASK_UPDATE_STATUS']);
    const screen = await render(<KanbanScreen />, { wrapper: Wrapper });

    await userEvent.press(screen.getByLabelText('Cài đặt bảng'));
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('MEMBER KHÔNG thấy "Cài đặt bảng"', async () => {
    mockBoard(['TASK_CREATE', 'TASK_UPDATE_STATUS']);
    const screen = await render(<KanbanScreen />, { wrapper: Wrapper });

    expect(screen.queryByLabelText('Cài đặt bảng')).toBeNull();
    expect(screen.getByText('Đồ án')).toBeOnTheScreen();
  });

  it('bảng lưu trữ ⇒ banner chỉ-xem', async () => {
    mockBoard([], { archived: true, permissions: READ_ONLY_PERMISSIONS });
    const screen = await render(<KanbanScreen />, { wrapper: Wrapper });

    expect(screen.getByText(/chỉ xem/)).toBeOnTheScreen();
  });

  it('lỗi tải ⇒ giữ AppBar, hiện nút "Thử lại"', async () => {
    const refetch = jest.fn();
    mockBoard([], { board: { data: undefined, error: new Error('Không có kết nối'), isError: true, isLoading: false, refetch } });
    const screen = await render(<KanbanScreen />, { wrapper: Wrapper });

    await userEvent.press(screen.getByText('Thử lại'));
    expect(refetch).toHaveBeenCalled();
  });

  it('p4-04: cờ project BẬT → nút "Dòng thời gian" ở AppBar, bấm mở màn Gantt', async () => {
    mockBoard(['TASK_UPDATE_STATUS'], { timelineEnabled: true });
    const screen = await render(<KanbanScreen />, { wrapper: Wrapper });

    await userEvent.press(screen.getByLabelText('Dòng thời gian'));
    expect(openTimeline).toHaveBeenCalledTimes(1);
  });

  it('p4-04: cờ project TẮT (hoặc chưa biết) → KHÔNG có nút "Dòng thời gian"; cài đặt bảng vẫn hiện cho OWNER/ADMIN', async () => {
    mockBoard(['BOARD_EDIT'], { timelineEnabled: false });
    const screen = await render(<KanbanScreen />, { wrapper: Wrapper });

    expect(screen.queryByLabelText('Dòng thời gian')).toBeNull();
    expect(screen.getByLabelText('Cài đặt bảng')).toBeOnTheScreen();
  });

  it('AppBar chỉ có 2 khe: OWNER/ADMIN + cờ project bật → gom "Dòng thời gian" và "Cài đặt bảng" vào MỘT menu "⋯"', async () => {
    mockBoard(['BOARD_EDIT'], { timelineEnabled: true });
    const screen = await render(<KanbanScreen />, { wrapper: Wrapper });

    expect(screen.queryByLabelText('Cài đặt bảng')).toBeNull();
    expect(screen.queryByLabelText('Dòng thời gian')).toBeNull();

    await userEvent.press(screen.getByLabelText('Tuỳ chọn bảng'));
    expect(await screen.findByText('Cài đặt bảng')).toBeOnTheScreen();
    await userEvent.press(screen.getByText('Dòng thời gian'));
    await waitFor(() => expect(openTimeline).toHaveBeenCalledTimes(1));
    expect(openSettings).not.toHaveBeenCalled();
  });

  it('AppBar: chỉ còn MỘT hành động (thành viên thường + cờ project bật) → icon thẳng, không bắt bấm hai lần qua menu', async () => {
    mockBoard(['TASK_UPDATE_STATUS'], { timelineEnabled: true });
    const screen = await render(<KanbanScreen />, { wrapper: Wrapper });

    expect(screen.getByLabelText('Dòng thời gian')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Tuỳ chọn bảng')).toBeNull();
  });

  it('không hành động nào (thành viên thường, cờ tắt) → không vẽ cả nút "⋯"', async () => {
    mockBoard(['TASK_UPDATE_STATUS'], { timelineEnabled: false });
    const screen = await render(<KanbanScreen />, { wrapper: Wrapper });

    expect(screen.queryByLabelText('Tuỳ chọn bảng')).toBeNull();
    expect(screen.queryByLabelText('Dòng thời gian')).toBeNull();
    expect(screen.queryByLabelText('Cài đặt bảng')).toBeNull();
  });

  it('p4-04: có lô dời lịch nền → banner dưới thanh lọc; không có lô thì không có banner', async () => {
    mockBoard(['TASK_UPDATE_STATUS'], { activeBatchId: 'batch-1' });
    const screen = await render(<KanbanScreen />, { wrapper: Wrapper });
    expect(screen.getByText('BANNER batch-1')).toBeOnTheScreen();
  });

  it('p4-04: không có lô nền → không có banner', async () => {
    mockBoard(['TASK_UPDATE_STATUS']);
    const screen = await render(<KanbanScreen />, { wrapper: Wrapper });
    expect(screen.queryByText(/BANNER/)).toBeNull();
  });

  it('p4-04: offline → banner lô ẩn (app.md §3)', async () => {
    mockBoard(['TASK_UPDATE_STATUS'], { activeBatchId: 'batch-1', offline: true });
    const screen = await render(<KanbanScreen />, { wrapper: Wrapper });
    expect(screen.queryByText('BANNER batch-1')).toBeNull();
  });
});
