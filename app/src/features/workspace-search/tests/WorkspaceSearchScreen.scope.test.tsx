import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { workspaceSearchService } from '../api/workspace-search.service';
import { WorkspaceSearchScreen } from '../screens/WorkspaceSearchScreen';
import { EMPTY_PAGE, renderWithProviders } from './fixtures';
import { mockedHead, mockedSearch, resetScreenMocks, typeQuery } from './screen-harness';

/**
 * Tờ bộ lọc — chọn PHẠM VI (kênh/nhóm chat), "Gồm tin nhắn riêng" và nút "Chỉ trong kênh này" (app.md p5-04 §2/§3). Khách không có danh
 * sách thành viên và không tìm được tin 1-1 ⇒ ẩn hai bộ lọc đó. Người gửi: `.pickers.test.tsx`.
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

const mockedScopes = jest.mocked(workspaceSearchService.listScopes);

beforeEach(async () => {
  await resetScreenMocks();
  mockedScopes.mockReset().mockResolvedValue([
    { id: 'ch-1', isPrivate: false, name: 'chung', type: 'CHANNEL' },
    { id: 'ch-2', isPrivate: true, name: 'do-an', type: 'CHANNEL' },
    { id: 'cv-1', isPrivate: true, name: 'Nhóm học tập', type: 'CONVERSATION' },
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

describe('SearchFilterSheet — phạm vi và tin 1-1', () => {
  it('chọn một kênh ⇒ "Áp dụng" gửi scopeType + scopeId (đi CẶP) + chip "Trong #kênh"', async () => {
    await openSheet();
    await fireEvent.press(screen.getByText('Phạm vi'));
    expect(await screen.findByText('Nhóm chat')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('#chung'));
    await apply();

    await waitFor(() =>
      expect(lastParams()).toMatchObject({ scopeId: 'ch-1', scopeType: 'CHANNEL' }),
    );
    expect(screen.getByRole('button', { name: 'Trong #chung' })).toBeOnTheScreen();
  });

  it('ô tìm phạm vi lọc KHÔNG dấu theo tên (chỉ còn nhóm chat khớp, tiêu đề "Kênh" biến mất)', async () => {
    await openSheet();
    await fireEvent.press(screen.getByText('Phạm vi'));
    await screen.findByText('#do-an');

    await fireEvent.changeText(screen.getByPlaceholderText('Tìm kênh hoặc nhóm chat'), 'nhom hoc');

    await waitFor(() => expect(screen.queryByText('#do-an')).toBeNull(), { timeout: 2000 });
    expect(screen.getByText('Nhóm học tập')).toBeOnTheScreen();
    // Tiêu đề NHÓM (vai `header`) — tab "Kênh" ở trên là một phần tử khác.
    expect(screen.queryByRole('header', { name: 'Kênh' })).toBeNull();
    expect(screen.getByRole('header', { name: 'Nhóm chat' })).toBeOnTheScreen();
  });

  it('"Chỉ trong kênh này" đóng tờ và mở màn tìm CỦA KÊNH (p1-09); nhóm chat mở màn tìm của hội thoại', async () => {
    await openSheet();
    await fireEvent.press(screen.getByText('Phạm vi'));
    await fireEvent.press(await screen.findByText('#do-an'));

    await fireEvent.press(screen.getByRole('button', { name: 'Chỉ trong kênh này' }));

    expect(router.push).toHaveBeenLastCalledWith({
      params: { chId: 'ch-2', wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/channels/[chId]/search',
    });
    expect(screen.queryByText('Bộ lọc tìm kiếm')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Bộ lọc' }));
    await fireEvent.press(await screen.findByText('Phạm vi'));
    await fireEvent.press(await screen.findByText('Nhóm học tập'));
    await fireEvent.press(screen.getByRole('button', { name: 'Chỉ trong nhóm chat này' }));

    expect(router.push).toHaveBeenLastCalledWith({
      params: { conversationId: 'cv-1' },
      pathname: '/messages/[conversationId]/search',
    });
  });

  it('"Gồm tin nhắn riêng" ⇒ includeDirect chỉ gửi khi BẬT + chip; KHÁCH không có dòng "Người gửi" lẫn công tắc này', async () => {
    const member = await openSheet();
    await fireEvent.press(screen.getByRole('switch', { name: 'Gồm tin nhắn riêng' }));
    await apply();
    await waitFor(() => expect(lastParams()).toMatchObject({ includeDirect: true }));
    expect(screen.getByRole('button', { name: 'Gồm tin nhắn riêng' })).toBeOnTheScreen();
    await member.unmount();

    mockedSearch.mockReset().mockResolvedValue(EMPTY_PAGE);
    mockedHead.mockResolvedValue({ myRole: 'GUEST', status: 'ACTIVE' });
    await openSheet();

    expect(screen.queryByText('Người gửi')).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Gồm tin nhắn riêng' })).toBeNull();
    expect(screen.getByText('Phạm vi')).toBeOnTheScreen();
  });
});
