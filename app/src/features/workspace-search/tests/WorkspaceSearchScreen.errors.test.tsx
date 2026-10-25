import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useConnectionState } from '@/core/socket';
import { showToast } from '@/shared/utils/toast.utils';

import { WorkspaceSearchScreen } from '../screens/WorkspaceSearchScreen';
import { apiError, makeMessageHit, messagePage, renderWithProviders } from './fixtures';
import { mockedSearch, resetScreenMocks, sleep, typeQuery } from './screen-harness';

/**
 * Màn "Tìm toàn workspace" (app.md p5-04 §8) — lỗi và trạng thái: `SRCH_*`, 404 mất quyền, `CFG_005`, 429 đếm ngược, offline, rỗng,
 * partial/truncated — tất cả hiện TẠI CHỖ. Ô tìm/tab: `.test.tsx`; bộ lọc: `.filters.test.tsx`.
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ wsId: 'ws-1' })),
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
jest.mock('@/shell/capabilities', () => {
  const { createElement } = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return {
    FeatureOffScreen: () => createElement(Text, null, 'Tính năng này hiện chưa được bật'),
    useCapabilities: () => ({ data: undefined }),
    useFeature: jest.fn(() => true),
  };
});
jest.mock('@/shared/theme', () => ({
  ...jest.requireActual('@/shared/theme'),
  useBreakpoint: jest.fn(),
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/core/socket', () => ({
  ...jest.requireActual('@/core/socket'),
  useConnectionState: jest.fn(),
}));
jest.mock('../api/workspace-search.service', () => ({
  workspaceSearchService: {
    getWorkspaceHead: jest.fn(),
    joinChannel: jest.fn(),
    listAuthors: jest.fn(),
    listScopes: jest.fn(),
    search: jest.fn(),
  },
}));

beforeEach(resetScreenMocks);

describe('WorkspaceSearchScreen — lỗi và trạng thái', () => {
  it('SRCH_104: thông điệp "Tìm kiếm quá rộng — thêm bộ lọc" kèm nút "Thêm bộ lọc"', async () => {
    mockedSearch.mockRejectedValue(apiError(422, 'SRCH_104'));
    await renderWithProviders(<WorkspaceSearchScreen />);

    await typeQuery('đồ án');

    expect(
      await screen.findByText('Tìm kiếm quá rộng — thêm bộ lọc', {}, { timeout: 2000 }),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Thêm bộ lọc' }));
    expect(await screen.findByText('Bộ lọc tìm kiếm')).toBeOnTheScreen();
  });

  it('SRCH_102 (phạm vi mất): báo tại chỗ + "Bỏ lọc phạm vi", KHÔNG đá khỏi nhóm', async () => {
    mockedSearch.mockRejectedValue(apiError(404, 'SRCH_102'));
    await renderWithProviders(<WorkspaceSearchScreen />);

    await typeQuery('đồ án');

    expect(
      await screen.findByText('Không tìm thấy phạm vi tìm kiếm', {}, { timeout: 2000 }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Bỏ lọc phạm vi' })).toBeOnTheScreen();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('404 mất quyền vào nhóm: toast trung tính + về danh sách nhóm; rời màn thì kết quả của nhóm bị XOÁ khỏi cache', async () => {
    mockedSearch.mockRejectedValue(apiError(404, 'PERM_404'));
    const { queryClient, unmount } = await renderWithProviders(<WorkspaceSearchScreen />);

    await typeQuery('đồ án');

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/workspaces'), {
      timeout: 2000,
    });
    expect(showToast).toHaveBeenCalledWith('info', 'Bạn không còn quyền xem nhóm này.');
    // Chỉ MỘT request 404: dọn cache lúc màn còn được quan sát sẽ làm query tự dựng lại và bắn thêm một lượt.
    expect(mockedSearch).toHaveBeenCalledTimes(1);
    const cache = queryClient.getQueryCache();
    const resultsKey = ['workspace-search', 'results', 'ws-1'];
    expect(
      cache.findAll({ queryKey: [...resultsKey, { q: 'đồ án', type: 'messages' }] }),
    ).toHaveLength(1);

    await unmount();

    expect(cache.findAll({ queryKey: resultsKey })).toHaveLength(0);
  });

  it('CFG_005 (cờ phụ vừa tắt): thay cả màn bằng "tính năng chưa được bật"', async () => {
    mockedSearch.mockRejectedValue(apiError(404, 'CFG_005'));
    await renderWithProviders(<WorkspaceSearchScreen />);

    await typeQuery('đồ án');

    expect(
      await screen.findByText('Tính năng này hiện chưa được bật', {}, { timeout: 2000 }),
    ).toBeOnTheScreen();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('429: đếm ngược retryAfterSeconds rồi TỰ thử lại', async () => {
    mockedSearch.mockRejectedValueOnce(apiError(429, 'RATE_002', { retryAfterSeconds: 1 }));
    mockedSearch.mockResolvedValue(messagePage([makeMessageHit()]));
    await renderWithProviders(<WorkspaceSearchScreen />);

    await typeQuery('đồ án');

    expect(
      await screen.findByText(/Tự thử lại sau 1 giây/, {}, { timeout: 2000 }),
    ).toBeOnTheScreen();
    expect(await screen.findByText('Nguyễn Văn An', {}, { timeout: 4000 })).toBeOnTheScreen();
    expect(mockedSearch).toHaveBeenCalledTimes(2);
  });

  it('mất mạng: "Cần kết nối để tìm", KHÔNG bắn request', async () => {
    jest.mocked(useConnectionState).mockReturnValue('offline');
    await renderWithProviders(<WorkspaceSearchScreen />);

    await typeQuery('đồ án');
    await sleep(550);

    expect(screen.getByText('Cần kết nối để tìm')).toBeOnTheScreen();
    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it('không kết quả: "Không tìm thấy tin nhắn"; đang lọc thì kèm "Xoá bộ lọc"', async () => {
    await renderWithProviders(<WorkspaceSearchScreen />);
    await typeQuery('xyz123');

    expect(
      await screen.findByText('Không tìm thấy tin nhắn', {}, { timeout: 2000 }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Bộ lọc' }));
    await fireEvent.press(await screen.findByRole('switch', { name: 'Chỉ tin có tệp đính kèm' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Áp dụng' }));

    // Vừa ở hàng lọc (LinkButton) vừa ở khối "không có kết quả" (Button) — cùng nhãn, cùng việc.
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Xoá bộ lọc' }).length).toBeGreaterThanOrEqual(
        2,
      ),
    );
  });

  it('partial:true hiện "Kết quả có thể chưa đầy đủ"; truncated:true hiện lời khuyên thu hẹp bằng phạm vi', async () => {
    mockedSearch.mockResolvedValue(
      messagePage([makeMessageHit()], { partial: true, truncated: true }),
    );
    await renderWithProviders(<WorkspaceSearchScreen />);

    await typeQuery('đồ án');

    expect(
      await screen.findByText(/Kết quả có thể chưa đầy đủ/, {}, { timeout: 2000 }),
    ).toBeOnTheScreen();
    expect(screen.getByText(/chỉ tìm ở nơi hoạt động gần đây/)).toBeOnTheScreen();
  });
});
