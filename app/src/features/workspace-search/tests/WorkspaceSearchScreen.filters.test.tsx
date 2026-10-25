import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { WorkspaceSearchScreen } from '../screens/WorkspaceSearchScreen';
import { makeMessageHit, messagePage, renderWithProviders } from './fixtures';
import { mockedSearch, resetScreenMocks, typeQuery } from './screen-harness';

/**
 * Màn "Tìm toàn workspace" (app.md p5-04 §8) — bộ lọc: nút "Bộ lọc" có chấm "Đang lọc" + chip, "Xoá bộ lọc" về đúng khoá cache của lượt chưa
 * lọc, tab Kênh/Người/Cuộc họp không có bộ lọc. Ô tìm/tab: `.test.tsx`; lỗi/trạng thái: `.errors.test.tsx`.
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

describe('WorkspaceSearchScreen — bộ lọc', () => {
  it('bật bộ lọc: nút "Bộ lọc" có CHẤM "Đang lọc" + chip, gọi lại với hasFile; "Xoá bộ lọc" gỡ chấm', async () => {
    mockedSearch.mockResolvedValue(messagePage([makeMessageHit()]));
    await renderWithProviders(<WorkspaceSearchScreen />);
    await typeQuery('đồ án');
    await screen.findByText('Nguyễn Văn An', {}, { timeout: 2000 });
    expect(screen.queryByLabelText('Đang lọc')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Bộ lọc' }));
    await fireEvent.press(await screen.findByRole('switch', { name: 'Chỉ tin có tệp đính kèm' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Áp dụng' }));

    expect(await screen.findByLabelText('Đang lọc')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Bộ lọc (1)' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Có tệp đính kèm' })).toBeOnTheScreen();
    await waitFor(() =>
      expect(mockedSearch).toHaveBeenLastCalledWith(
        'ws-1',
        expect.objectContaining({ hasFile: true, q: 'đồ án' }),
      ),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Xoá bộ lọc' }));

    await waitFor(() => expect(screen.queryByLabelText('Đang lọc')).toBeNull());
    // Về đúng khoá cache của lượt CHƯA lọc (còn tươi, staleTime 30 s) ⇒ hiện lại ngay, không tốn thêm một lượt trong hạn mức 30 lần/phút.
    expect(screen.getByText('Nguyễn Văn An')).toBeOnTheScreen();
    expect(mockedSearch).toHaveBeenCalledTimes(2);
  });

  it('tab Kênh/Người/Cuộc họp không có bộ lọc: ẩn hàng lọc, chỉ gửi { q, type }', async () => {
    await renderWithProviders(<WorkspaceSearchScreen />);
    await typeQuery('đồ án');
    await waitFor(() => expect(mockedSearch).toHaveBeenCalled(), { timeout: 2000 });
    expect(screen.getByRole('button', { name: 'Bộ lọc' })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('tab', { name: /^Kênh/ }));

    await waitFor(() =>
      expect(mockedSearch).toHaveBeenLastCalledWith('ws-1', { q: 'đồ án', type: 'channels' }),
    );
    expect(screen.queryByRole('button', { name: 'Bộ lọc' })).toBeNull();
    // Chờ lượt của tab Kênh XONG (rỗng ⇒ "Không tìm thấy kênh"): kết quả về sau khi test kết thúc là cập nhật state ngoài `act`.
    expect(await screen.findByText('Không tìm thấy kênh')).toBeOnTheScreen();
  });
});
