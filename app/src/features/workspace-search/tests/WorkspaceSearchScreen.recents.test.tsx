import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { WorkspaceSearchScreen } from '../screens/WorkspaceSearchScreen';
import { useWorkspaceSearchStore } from '../store/workspace-search.store';
import { makeMessageHit, messagePage, renderWithProviders } from './fixtures';
import { mockedSearch, resetScreenMocks } from './screen-harness';

/**
 * "Tìm gần đây" của màn tìm (app.md p5-04 §4): nhấn "Tìm" chốt từ khoá, xoá ô thì hiện danh sách, chạm một mục tìm NGAY và không tự
 * bật bàn phím, xoá từng mục/tất cả (cả bộ nhớ lẫn đĩa). Mở kết quả tin + máy tính bảng: `.open.test.tsx`.
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ wsId: 'ws-1' })),
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
jest.mock('@/shell/capabilities', () => ({
  FeatureOffScreen: () => null,
  useCapabilities: () => ({ data: undefined }),
  useFeature: jest.fn(() => true),
}));
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

describe('WorkspaceSearchScreen — tìm gần đây', () => {
  it('nhấn "Tìm" chốt từ khoá; xoá ô ⇒ hiện danh sách; chạm một mục ⇒ điền lại và hiện kết quả, KHÔNG bật lại bàn phím', async () => {
    mockedSearch.mockResolvedValue(messagePage([makeMessageHit()]));
    await renderWithProviders(<WorkspaceSearchScreen />);
    expect(screen.getByPlaceholderText('Tìm trong nhóm').props.autoFocus).toBe(true);

    await fireEvent(screen.getByPlaceholderText('Tìm trong nhóm'), 'submitEditing', {
      nativeEvent: { text: 'đồ án' },
    });
    await waitFor(() => expect(mockedSearch).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(useWorkspaceSearchStore.getState().recents['recent-search:u-me:ws-1']).toEqual([
      'đồ án',
    ]);
    await fireEvent.changeText(screen.getByPlaceholderText('Tìm trong nhóm'), '');

    expect(await screen.findByText('Tìm gần đây')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'đồ án' }));

    expect(await screen.findByText('Nguyễn Văn An', {}, { timeout: 2000 })).toBeOnTheScreen();
    // Ô được DỰNG LẠI với chữ mới (defaultValue) và không autofocus — quay về từ tin/chọn gợi ý không tự mở bàn phím.
    expect(screen.getByPlaceholderText('Tìm trong nhóm').props.autoFocus).toBe(false);
  });

  it('chạm một mục tìm gần đây ⇒ gọi API NGAY, không chờ nhịp debounce 300 ms', async () => {
    useWorkspaceSearchStore.getState().add('recent-search:u-me:ws-1', 'báo cáo');
    await renderWithProviders(<WorkspaceSearchScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'báo cáo' }));

    await waitFor(
      () =>
        expect(mockedSearch).toHaveBeenCalledWith(
          'ws-1',
          expect.objectContaining({ q: 'báo cáo' }),
        ),
      {
        timeout: 250,
      },
    );
  });

  it('xoá từng mục và "Xoá tất cả" — cả bộ nhớ lẫn đĩa', async () => {
    useWorkspaceSearchStore.getState().add('recent-search:u-me:ws-1', 'đồ án');
    useWorkspaceSearchStore.getState().add('recent-search:u-me:ws-1', 'báo cáo');
    await renderWithProviders(<WorkspaceSearchScreen />);

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Xoá “đồ án” khỏi tìm gần đây' }),
    );
    expect(useWorkspaceSearchStore.getState().recents['recent-search:u-me:ws-1']).toEqual([
      'báo cáo',
    ]);

    await fireEvent.press(screen.getByRole('button', { name: 'Xoá tất cả' }));

    expect(useWorkspaceSearchStore.getState().recents['recent-search:u-me:ws-1']).toEqual([]);
    await waitFor(async () =>
      expect(await AsyncStorage.getItem('recent-search:u-me:ws-1')).toBeNull(),
    );
  });
});
