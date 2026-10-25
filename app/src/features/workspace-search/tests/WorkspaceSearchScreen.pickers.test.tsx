import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { workspaceSearchService } from '../api/workspace-search.service';
import { WorkspaceSearchScreen } from '../screens/WorkspaceSearchScreen';
import { renderWithProviders } from './fixtures';
import { mockedSearch, resetScreenMocks, typeQuery } from './screen-harness';

/**
 * Tờ bộ lọc — chọn NGƯỜI GỬI (app.md p5-04 §2/§3). Sửa trên bản nháp, "Áp dụng" mới gọi lại; đóng tờ mà không áp dụng thì bộ lọc
 * không đổi. Phạm vi/tin 1-1/khách: `.scope.test.tsx`; bật/tắt "có tệp" và chấm báo đang lọc: `.filters.test.tsx`.
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

const mockedAuthors = jest.mocked(workspaceSearchService.listAuthors);

beforeEach(async () => {
  await resetScreenMocks();
  mockedAuthors.mockReset().mockResolvedValue([
    { avatarUrl: null, name: 'Nguyễn Văn An', userId: 'u-an' },
    { avatarUrl: null, name: 'Trần Thị Bình', userId: 'u-binh' },
  ]);
});

async function openSheet() {
  const view = await renderWithProviders(<WorkspaceSearchScreen />);
  await typeQuery('đồ án');
  await waitFor(() => expect(mockedSearch).toHaveBeenCalled(), { timeout: 2000 });
  await fireEvent.press(screen.getByRole('button', { name: 'Bộ lọc' }));
  await screen.findByText('Bộ lọc tìm kiếm');
  return view;
}

const apply = () => fireEvent.press(screen.getByRole('button', { name: 'Áp dụng' }));
const lastParams = () => mockedSearch.mock.lastCall?.[1];

describe('SearchFilterSheet — người gửi', () => {
  it('chọn một thành viên ⇒ hiện tên ở dòng "Người gửi"; "Áp dụng" gửi authorId + chip "Người gửi: …"', async () => {
    await openSheet();
    expect(screen.getByText('Tất cả')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Người gửi'));
    await fireEvent.press(await screen.findByText('Trần Thị Bình'));

    expect(screen.getByText('Bộ lọc tìm kiếm')).toBeOnTheScreen();
    expect(screen.getByText('Trần Thị Bình')).toBeOnTheScreen();
    await apply();

    await waitFor(() => expect(lastParams()).toMatchObject({ authorId: 'u-binh', q: 'đồ án' }));
    expect(screen.getByRole('button', { name: 'Người gửi: Trần Thị Bình' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Bộ lọc (1)' })).toBeOnTheScreen();
  });

  it('gõ tên trong ô tìm người gửi ⇒ gọi lại danh sách với từ khoá đã qua nhịp chờ (BE lọc không dấu)', async () => {
    await openSheet();
    await fireEvent.press(screen.getByText('Người gửi'));
    await screen.findByText('Nguyễn Văn An');

    await fireEvent.changeText(screen.getByPlaceholderText('Tìm người gửi'), 'binh');

    await waitFor(() => expect(mockedAuthors).toHaveBeenCalledWith('ws-1', 'binh'), {
      timeout: 2000,
    });
  });

  it('đóng tờ mà KHÔNG bấm "Áp dụng": bộ lọc không đổi, không gọi lại (mỗi lượt tốn hạn mức 30 lần/phút); mở lại thì bản nháp về đúng bộ lọc hiện hành', async () => {
    await openSheet();
    const calls = mockedSearch.mock.calls.length;
    await fireEvent.press(screen.getByText('Người gửi'));
    await fireEvent.press(await screen.findByText('Nguyễn Văn An'));
    expect(screen.getByText('Nguyễn Văn An')).toBeOnTheScreen();

    // Nền mờ và nút ✕ cùng nhãn "Đóng".
    await fireEvent.press(screen.getAllByRole('button', { name: 'Đóng' })[0]!);

    await waitFor(() => expect(screen.queryByText('Bộ lọc tìm kiếm')).toBeNull());
    expect(screen.getByRole('button', { name: 'Bộ lọc' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Người gửi: Nguyễn Văn An' })).toBeNull();
    expect(mockedSearch).toHaveBeenCalledTimes(calls);

    await fireEvent.press(screen.getByRole('button', { name: 'Bộ lọc' }));
    expect(await screen.findByText('Tất cả')).toBeOnTheScreen();
  });

  it('"Đặt lại" đưa BẢN NHÁP về rỗng nhưng chưa áp dụng — bấm "Áp dụng" mới gọi lại', async () => {
    await openSheet();
    const calls = mockedSearch.mock.calls.length;
    await fireEvent.press(screen.getByText('Người gửi'));
    await fireEvent.press(await screen.findByText('Nguyễn Văn An'));

    await fireEvent.press(screen.getByRole('button', { name: 'Đặt lại' }));

    expect(screen.getByText('Tất cả')).toBeOnTheScreen();
    expect(mockedSearch).toHaveBeenCalledTimes(calls);
  });
});
