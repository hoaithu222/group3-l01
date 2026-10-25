import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { MediaLibraryScreen } from '../screens/MediaLibraryScreen';

/**
 * Thư viện của hội thoại phân trang 30 mục (cursor). Trước đây màn chỉ hiện trang ĐẦU — nhóm chia sẻ nhiều thì tệp cũ không có đường
 * nào xem được. Giờ cuối danh sách có "Tải thêm" (đang tải trang sau ⇒ vòng `LoadingMore` thay cho nút, không bấm đúp được).
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ conversationId: 'c-1', kind: 'FILE' }),
}));

const mockMedia = {
  data: {
    pages: [
      {
        data: [
          {
            attachment: {
              assetId: 'a-1',
              durationMs: null,
              height: null,
              kind: 'FILE',
              mime: 'application/pdf',
              name: 'de-cuong.pdf',
              size: 1536,
              thumbnailAssetId: null,
              width: null,
            },
            authorId: 'u-1',
            createdAt: '2026-09-20T08:00:00.000Z',
            messageId: 'm-1',
            seq: 1,
          },
        ],
      },
    ],
  },
  error: null,
  fetchNextPage: jest.fn(),
  hasNextPage: true,
  isError: false,
  isFetchingNextPage: false,
  isLoading: false,
  isRefetching: false,
  refetch: jest.fn(),
};
jest.mock('../hooks/useConversationMedia', () => ({ useConversationMedia: () => mockMedia }));

const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function Wrapper({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMedia.hasNextPage = true;
  mockMedia.isFetchingNextPage = false;
});

describe('MediaLibraryScreen — phân trang', () => {
  it('còn trang sau ⇒ có "Tải thêm"; bấm thì tải trang kế', async () => {
    await render(<MediaLibraryScreen />, { wrapper: Wrapper });

    expect(screen.getByText('de-cuong.pdf')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tải thêm' }));

    expect(mockMedia.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('đang tải trang sau ⇒ KHÔNG có nút (tránh bấm đúp); hết trang ⇒ cũng không có nút', async () => {
    mockMedia.isFetchingNextPage = true;
    const { rerender } = await render(<MediaLibraryScreen />, { wrapper: Wrapper });
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).toBeNull();

    mockMedia.isFetchingNextPage = false;
    mockMedia.hasNextPage = false;
    await rerender(<MediaLibraryScreen />);
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).toBeNull();
  });
});
