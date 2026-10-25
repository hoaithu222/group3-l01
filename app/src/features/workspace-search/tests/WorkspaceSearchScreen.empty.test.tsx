import { fireEvent, render, screen } from '@testing-library/react-native';

import { useCapabilities } from '@/shell/capabilities';

import { SearchStateView } from '../components/SearchStateView';
import { WorkspaceSearchScreen } from '../screens/WorkspaceSearchScreen';
import { renderWithProviders } from './fixtures';
import { mockedSearch, resetScreenMocks, typeQuery } from './screen-harness';

/**
 * "Không tìm thấy" phải NÓI THẬT (be.md p5-04 §5): khi chưa chọn khoảng ngày, BE chỉ tìm tin/tệp trong `defaultLookbackMonths` (12) tháng
 * gần nhất — tin cũ hơn không hiện, và người dùng đọc "không có" thành "tin đã mất". Màn báo rõ + mở thẳng ô chọn khoảng ngày.
 * Các trạng thái khác: `.errors.test.tsx`.
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
  useCapabilities: jest.fn(),
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

const HINT = /Khi chưa chọn khoảng ngày, chỉ tìm trong (\d+) tháng gần nhất/;

function capabilitiesLimits(search: unknown) {
  jest.mocked(useCapabilities).mockReturnValue({ data: { limits: { search } } } as never);
}

beforeEach(async () => {
  await resetScreenMocks();
  jest.mocked(useCapabilities).mockReturnValue({ data: undefined } as never);
});

describe('WorkspaceSearchScreen — không tìm thấy', () => {
  it('tab Tin nhắn chưa chọn ngày: nói rõ chỉ tìm 12 tháng gần nhất + nút "Chọn khoảng ngày" mở tờ bộ lọc', async () => {
    await renderWithProviders(<WorkspaceSearchScreen />);
    await typeQuery('xyz123');

    expect(
      await screen.findByText('Không tìm thấy tin nhắn', {}, { timeout: 2000 }),
    ).toBeOnTheScreen();
    expect(screen.getByText(HINT)).toHaveTextContent(/trong 12 tháng gần nhất/);

    await fireEvent.press(screen.getByRole('button', { name: 'Chọn khoảng ngày' }));

    expect(await screen.findByText('Bộ lọc tìm kiếm')).toBeOnTheScreen();
  });

  it('số tháng theo capabilities (limits.search.defaultLookbackMonths); thiếu/sai kiểu thì rơi về 12', async () => {
    for (const [value, months] of [
      [6, '6 tháng'],
      [0, '12 tháng'],
      ['ba', '12 tháng'],
      [2.5, '12 tháng'],
    ] as const) {
      capabilitiesLimits({ defaultLookbackMonths: value });
      const view = await renderWithProviders(<WorkspaceSearchScreen />);
      await typeQuery('xyz123');

      expect(await screen.findByText(HINT, {}, { timeout: 2000 })).toHaveTextContent(
        new RegExp(`trong ${months} gần nhất`),
      );
      await view.unmount();
    }
  });

  it('tab Kênh (không có khoảng ngày): KHÔNG nhắc 12 tháng, không có nút "Chọn khoảng ngày"', async () => {
    await renderWithProviders(<WorkspaceSearchScreen />);
    await typeQuery('xyz123');
    await screen.findByText('Không tìm thấy tin nhắn', {}, { timeout: 2000 });

    await fireEvent.press(screen.getByRole('tab', { name: /^Kênh/ }));

    expect(await screen.findByText('Không tìm thấy kênh')).toBeOnTheScreen();
    expect(screen.queryByText(HINT)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Chọn khoảng ngày' })).toBeNull();
    expect(screen.getByText('Thử bỏ dấu, đổi từ khoá hoặc bỏ bộ lọc.')).toBeOnTheScreen();
    expect(mockedSearch).toHaveBeenLastCalledWith('ws-1', { q: 'xyz123', type: 'channels' });
  });
});

describe('SearchStateView — rỗng', () => {
  const props = {
    dateRangeSet: false,
    error: null,
    errorStamp: 0,
    hasFilters: false,
    issue: null,
    lookbackMonths: 12,
    onClearFilters: jest.fn(),
    onClearScope: jest.fn(),
    onOpenFilters: jest.fn(),
    onRetry: jest.fn(),
    status: 'empty',
    tab: 'messages',
  } as const;

  it('ĐÃ chọn khoảng ngày: câu gợi ý thường, không nhắc 12 tháng, không có "Chọn khoảng ngày"', async () => {
    await render(<SearchStateView {...props} dateRangeSet />);

    expect(screen.getByText('Thử bỏ dấu, đổi từ khoá hoặc bỏ bộ lọc.')).toBeOnTheScreen();
    expect(screen.queryByText(HINT)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Chọn khoảng ngày' })).toBeNull();
  });

  it('đang lọc (người gửi…) mà chưa chọn ngày: có CẢ "Xoá bộ lọc" và "Chọn khoảng ngày"', async () => {
    await render(<SearchStateView {...props} hasFilters />);

    await fireEvent.press(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Chọn khoảng ngày' }));

    expect(props.onClearFilters).toHaveBeenCalledTimes(1);
    expect(props.onOpenFilters).toHaveBeenCalledTimes(1);
  });

  it('tab Tệp cũng chịu khoảng lùi mặc định (tệp của tin đi cùng đường quét tin)', async () => {
    await render(<SearchStateView {...props} tab="files" />);

    expect(screen.getByText('Không tìm thấy tệp')).toBeOnTheScreen();
    expect(screen.getByText(HINT)).toBeOnTheScreen();
  });
});
