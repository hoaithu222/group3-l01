import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { registerBoardCardAction, registerBoardHeaderAction, resetBoardExtensions } from '@/shared/board-extensions';

import { useBoards } from '../queries/boards.queries';
import { useWorkspaceBoardAccess } from '../queries/workspace-access.queries';
import { BoardListScreen } from '../screens/BoardListScreen';
import { KanbanScreen } from '../screens/KanbanScreen';
import { useKanbanBoard } from '../hooks/useKanbanBoard';
import { resolveBoardPermissions } from '../utils/board-permissions';

/**
 * Khe `@/shared/board-extensions` ở màn bảng (p4-06): feature khác (`contribution`) gắn lối vào vào thanh tiêu đề Kanban và dưới thẻ bảng trong danh sách MÀ `boards` không import nó.
 * Ở đây chỉ kiểm `boards` vẽ khe đúng chỗ, đúng ngữ cảnh (`wsId`/`boardId`), và không đổi gì khi chưa đăng ký.
 */
jest.mock('expo-router', () => ({
  Redirect: () => null,
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ boardId: 'b1', wsId: 'w1' }),
}));
jest.mock('../hooks/useKanbanBoard', () => ({ useKanbanBoard: jest.fn() }));
jest.mock('../queries/boards.queries', () => ({ useBoards: jest.fn() }));
jest.mock('../queries/workspace-access.queries', () => ({ useWorkspaceBoardAccess: jest.fn() }));
jest.mock('../components/kanban/KanbanPager', () => ({ KanbanPager: () => null }));
jest.mock('../components/kanban/drag/DragOverlay', () => ({ DragOverlay: () => null }));
jest.mock('../components/kanban/drag/DragProvider', () => ({ DragProvider: ({ children }: { children: ReactNode }) => children }));
jest.mock('../components/MoveTaskSheet', () => ({ MoveTaskSheet: () => null }));
jest.mock('../components/BoardFilterBar', () => ({ BoardFilterBar: () => null }));
jest.mock('../components/kanban/RescheduleBanner', () => ({ RescheduleBanner: () => null }));

const METRICS = { frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 44 } };
const Wrapper = ({ children }: { children: ReactNode }) => <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>;

function mockKanban(myPermissions: string[]) {
  (useKanbanBoard as jest.Mock).mockReturnValue({
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
    openSettings: jest.fn(),
    openTimeline: jest.fn(),
    permissions: resolveBoardPermissions(myPermissions),
    setMenuTask: jest.fn(),
    tasks: { data: { columns: {}, hasMore: {} }, error: null, isError: false, refetch: jest.fn() },
    tasksByColumn: {},
    timelineEnabled: false,
  } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  resetBoardExtensions();
});
afterAll(() => resetBoardExtensions());

describe('KanbanScreen — khe nút ở thanh tiêu đề', () => {
  it('feature khác đăng ký nút → hiện ở AppBar kèm đúng wsId/boardId, kể cả với MEMBER (không cần quyền sửa bảng)', async () => {
    mockKanban(['TASK_CREATE']);
    registerBoardHeaderAction('test', (context) => <Text>{`Nút ngoài ${context.wsId}/${context.boardId}`}</Text>);
    const screen = await render(<KanbanScreen />, { wrapper: Wrapper });

    expect(screen.getByText('Nút ngoài w1/b1')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Cài đặt bảng')).toBeNull();
  });

  it('chưa ai đăng ký → thanh tiêu đề giữ nguyên (chỉ có nút của boards)', async () => {
    mockKanban(['BOARD_EDIT']);
    const screen = await render(<KanbanScreen />, { wrapper: Wrapper });

    expect(screen.getByLabelText('Cài đặt bảng')).toBeOnTheScreen();
    expect(screen.queryByText(/Nút ngoài/)).toBeNull();
  });
});

describe('BoardListScreen — khe lối vào dưới thẻ bảng', () => {
  const board = (id: string, name: string) => ({ columns: [], doneCount: 0, id, name, taskCount: 0, updatedAt: '2026-09-01T00:00:00.000Z' });

  beforeEach(() => {
    (useBoards as jest.Mock).mockReturnValue({ data: [board('b1', 'Đồ án'), board('b2', 'Sprint 2')], error: null, isError: false, isLoading: false, isRefetching: false, refetch: jest.fn() });
    (useWorkspaceBoardAccess as jest.Mock).mockReturnValue({ data: { myRole: 'MEMBER', status: 'ACTIVE' } });
  });

  it('mỗi thẻ bảng có lối vào của feature khác, đúng boardId của thẻ đó', async () => {
    registerBoardCardAction('test', (context) => <Text>{`Liên kết ${context.wsId}/${context.boardId}`}</Text>);
    const screen = await render(<BoardListScreen />, { wrapper: Wrapper });

    expect(screen.getByText('Liên kết w1/b1')).toBeOnTheScreen();
    expect(screen.getByText('Liên kết w1/b2')).toBeOnTheScreen();
  });

  it('chưa ai đăng ký → danh sách giữ nguyên', async () => {
    const screen = await render(<BoardListScreen />, { wrapper: Wrapper });

    expect(screen.getByText('Đồ án')).toBeOnTheScreen();
    expect(screen.queryByText(/Liên kết/)).toBeNull();
  });
});
