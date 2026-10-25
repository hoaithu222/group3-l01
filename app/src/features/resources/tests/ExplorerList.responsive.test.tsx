import { render } from '@testing-library/react-native';
import { useWindowDimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ExplorerList } from '../components/ExplorerList';
import type { ExplorerData } from '../hooks/useExplorerData';
import type { ExplorerItem } from '../utils/explorer-items';

/**
 * Lưới tài liệu ĐỔI SỐ CỘT theo bề rộng (docs/rules/responsive.md — kiểm 4 cỡ 320/390/600/840): điện thoại 2 cột, máy
 * tính bảng 4 cột; chế độ danh sách luôn 1 cột. `key` đổi theo số cột vì FlashList không cho đổi `numColumns` tại chỗ —
 * không đổi `key` thì xoay máy/kéo chia đôi màn hình là danh sách kẹt ở số cột cũ.
 *
 * ⚠️ Số cột đi qua PROP `numColumns` (không nhận className) nên đọc được ở đây; bề rộng ô là class → xem trên máy thật.
 */

// Mock ở tầng module của React Native, cùng lối với `tests/theme/breakpoints.test.ts` (giải thích ở đó).
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockFlashListProps = jest.fn();
jest.mock('@shopify/flash-list', () => ({
  FlashList: (props: unknown) => {
    mockFlashListProps(props);
    return null;
  },
}));

const mockedWindow = useWindowDimensions as jest.MockedFunction<typeof useWindowDimensions>;

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function data(): ExplorerData {
  return {
    breadcrumb: [],
    currentFolder: undefined,
    error: null,
    fetchNextPage: jest.fn(),
    forbidden: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
    isRefetching: false,
    items: [{ key: 'file-1' }, { key: 'file-2' }] as unknown as ExplorerItem[],
    refetch: jest.fn(),
    searching: false,
  };
}

async function renderList(view: 'grid' | 'list', width: number) {
  mockedWindow.mockReturnValue({ fontScale: 1, height: 800, scale: 2, width });
  mockFlashListProps.mockClear();
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ExplorerList
        data={data()}
        emptyActions={[]}
        view={view}
        onClearSearch={jest.fn()}
        onLeave={jest.fn()}
        onMore={jest.fn()}
        onOpen={jest.fn()}
      />
    </SafeAreaProvider>,
  );
  return mockFlashListProps.mock.calls.at(-1)?.[0] as { numColumns: number };
}

describe('ExplorerList — số cột theo bề rộng', () => {
  it.each([
    [320, 2],
    [390, 2],
    [600, 4],
    [840, 4],
  ])('lưới ở %ipx ⇒ %i cột', async (width, columns) => {
    const props = await renderList('grid', width);

    expect(props.numColumns).toBe(columns);
  });

  it.each([320, 390, 600, 840])('danh sách ở %ipx ⇒ luôn 1 cột', async (width) => {
    const props = await renderList('list', width);

    expect(props.numColumns).toBe(1);
  });
});
