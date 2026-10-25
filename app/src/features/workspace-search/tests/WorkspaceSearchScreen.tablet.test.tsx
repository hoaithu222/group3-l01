import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useBreakpoint } from '@/shared/theme';

import { WorkspaceSearchScreen } from '../screens/WorkspaceSearchScreen';
import { makeMessageHit, messagePage, renderWithProviders } from './fixtures';
import { mockedSearch, resetScreenMocks, TABLET, typeQuery } from './screen-harness';

/**
 * Máy tính bảng (app.md p5-04 §7): kết quả tin ở nửa trái, chạm CHỌN để xem trước ở nửa phải (không rời màn), "Mở tin nhắn" mới
 * điều hướng; điện thoại không có khung xem trước. Mở kết quả: `.open.test.tsx` · `.results.test.tsx`.
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

describe('WorkspaceSearchScreen — máy tính bảng', () => {
  it('kết quả tin ở nửa trái: chạm CHỌN để xem trước (không rời màn); "Mở tin nhắn" mới điều hướng', async () => {
    jest.mocked(useBreakpoint).mockReturnValue(TABLET);
    mockedSearch.mockResolvedValue(
      messagePage([
        makeMessageHit({
          messageId: 'm-5',
          snippet: 'Nộp báo cáo trước thứ Sáu',
          highlights: [{ start: 4, end: 10 }],
        }),
      ]),
    );
    await renderWithProviders(<WorkspaceSearchScreen />);
    await typeQuery('báo cáo');
    expect(
      await screen.findByText('Chọn một tin nhắn ở bên trái để xem trước.', {}, { timeout: 2000 }),
    ).toBeOnTheScreen();

    await fireEvent.press(await screen.findByRole('button', { name: /Nộp báo cáo trước thứ Sáu/ }));

    expect(router.push).not.toHaveBeenCalled();
    expect(screen.queryByText('Chọn một tin nhắn ở bên trái để xem trước.')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Mở tin nhắn' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/workspaces/[wsId]/channels/[chId]',
      params: { wsId: 'ws-1', chId: 'ch-1', m: 'm-5' },
    });
  });

  it('điện thoại KHÔNG có khung xem trước; tab khác (Tệp…) trên máy tính bảng vẫn mở thẳng', async () => {
    mockedSearch.mockResolvedValue(messagePage([makeMessageHit()]));
    await renderWithProviders(<WorkspaceSearchScreen />);
    await typeQuery('đồ án');

    await screen.findByText('Nguyễn Văn An', {}, { timeout: 2000 });
    expect(screen.queryByText('Chọn một tin nhắn ở bên trái để xem trước.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mở tin nhắn' })).toBeNull();
  });
});
