import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, renderHook, screen, waitFor } from '@testing-library/react-native';
import { Redirect, router } from 'expo-router';
import type { ReactNode } from 'react';

import { showToast } from '@/shared/utils/toast.utils';

import { workspaceAccessApi, workspacesService } from '../api';
import { useJoinPendingState } from '../hooks/useJoinPendingState';
import { JoinPendingScreen } from '../screens/JoinPendingScreen';
import { listItem, makeQueryClient, renderWithProviders } from './test-utils';

/**
 * Màn CHỜ DUYỆT (app.md p3-04 §3, §8 — RB-07/RB-08 phía app). Trạng thái chờ suy từ danh
 * sách nhóm của mình (`GET /workspaces` trả mục `PENDING`) vì người đang chờ chưa đọc được
 * `GET /workspaces/:id` — test khoá cách suy đó và các tín hiệu HỎI LẠI sớm.
 */

const mockSocketHandlers = new Map<string, (payload: unknown) => void>();
jest.mock('@/core/socket', () => {
  const { SocketEvent } = jest.requireActual('@/core/socket/socket.events');
  return {
    SocketEvent,
    useSocketEvent: (event: string, handler: (payload: unknown) => void) => {
      mockSocketHandlers.set(event, handler);
    },
  };
});
jest.mock('expo-router', () => ({
  Redirect: jest.fn(() => null),
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ wsId: 'ws-9' }),
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return {
    ...actual,
    workspaceAccessApi: { cancelJoinRequest: jest.fn(), updateSettings: jest.fn() },
    workspacesService: { ...actual.workspacesService, list: jest.fn() },
  };
});

const mockedList = jest.mocked(workspacesService.list);
const mockedCancel = jest.mocked(workspaceAccessApi.cancelJoinRequest);

beforeEach(() => {
  jest.clearAllMocks();
  mockSocketHandlers.clear();
});

describe('JoinPendingScreen', () => {
  it('mục PENDING → "Đang chờ quản trị nhóm duyệt" + tên nhóm; Huỷ yêu cầu → cancel rồi về danh sách nhóm', async () => {
    mockedList.mockResolvedValue([listItem()]);
    mockedCancel.mockResolvedValue(undefined);
    await renderWithProviders(<JoinPendingScreen />);

    expect(await screen.findByText('Đang chờ quản trị nhóm duyệt')).toBeOnTheScreen();
    expect(screen.getByText(/"Nhóm Toán 12"/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Huỷ yêu cầu'));

    await waitFor(() => expect(mockedCancel).toHaveBeenCalledWith('ws-9'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/workspaces'));
    expect(showToast).toHaveBeenCalledWith('success', 'Đã huỷ yêu cầu tham gia.');
  });

  it('đang chờ: danh thiếp ĐÚNG nhóm + ba chặng; "Về danh sách nhóm" rời màn mà KHÔNG huỷ yêu cầu', async () => {
    mockedList.mockResolvedValue([listItem()]);
    await renderWithProviders(<JoinPendingScreen />);

    expect(await screen.findByLabelText('Nhóm Nhóm Toán 12')).toBeOnTheScreen();
    expect(screen.getByText('Đã gửi yêu cầu')).toBeOnTheScreen();
    expect(screen.getByText('Quản trị nhóm xem xét (đang chờ)')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Về danh sách nhóm'));

    expect(router.replace).toHaveBeenCalledWith('/workspaces');
    expect(mockedCancel).not.toHaveBeenCalled();
  });

  it('được duyệt (mục thành ACTIVE) → <Redirect> thẳng vào nhóm, không có nút huỷ', async () => {
    mockedList.mockResolvedValue([listItem({ status: 'ACTIVE' })]);
    await renderWithProviders(<JoinPendingScreen />);

    await waitFor(() =>
      expect(jest.mocked(Redirect)).toHaveBeenCalledWith(
        { href: { pathname: '/workspaces/[wsId]', params: { wsId: 'ws-9' } } },
        undefined,
      ),
    );
    expect(screen.queryByText('Huỷ yêu cầu')).toBeNull();
  });

  it('bị từ chối (mục biến mất) → "Yêu cầu không được chấp nhận", có lối về danh sách nhóm', async () => {
    mockedList.mockResolvedValue([]);
    await renderWithProviders(<JoinPendingScreen />);

    expect(await screen.findByText('Yêu cầu không được chấp nhận')).toBeOnTheScreen();
    expect(screen.getByText(/xin vào lại sau 24 giờ/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Về danh sách nhóm'));
    expect(router.replace).toHaveBeenCalledWith('/workspaces');
  });
});

describe('useJoinPendingState', () => {
  async function mount() {
    const queryClient = makeQueryClient();
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }
    return renderHook(() => useJoinPendingState('ws-9'), { wrapper: Wrapper });
  }

  it('loading → pending; nhận notification:created thì HỎI LẠI ngay (không chờ vòng poll) và thấy được duyệt', async () => {
    mockedList.mockResolvedValueOnce([listItem()]).mockResolvedValue([listItem({ status: 'ACTIVE' })]);
    const { result } = await mount();

    expect(result.current.state).toBe('loading');
    await waitFor(() => expect(result.current.state).toBe('pending'));
    expect(mockedList).toHaveBeenCalledTimes(1);

    // Người đang chờ CHƯA ở room `ws:` — tín hiệu tới thật là `notification:created` (user room).
    mockSocketHandlers.get('notification:created')?.({});

    await waitFor(() => expect(result.current.state).toBe('approved'));
    expect(mockedList).toHaveBeenCalledTimes(2);
  });

  it('member:updated của NGƯỜI KHÁC hoặc nhóm khác không làm gì', async () => {
    mockedList.mockResolvedValue([listItem()]);
    const { result } = await mount();
    await waitFor(() => expect(result.current.state).toBe('pending'));

    mockSocketHandlers.get('member:updated')?.({ workspaceId: 'ws-khac', userId: undefined });

    expect(mockedList).toHaveBeenCalledTimes(1);
  });
});
