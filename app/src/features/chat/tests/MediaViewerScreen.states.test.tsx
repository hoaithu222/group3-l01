import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { chatService } from '../api/chat.service';
import { MediaViewerScreen } from '../components/media/MediaViewerScreen';

/**
 * Trình xem ảnh/video: KHÔNG được là một màn đen trống. Thanh công cụ (nút "Đóng") cần một tệp đính kèm, nên lúc chưa có tệp
 * — đang tải tin, tải lỗi, tin không còn ảnh/video — màn phải tự có chữ nói chuyện gì đang xảy ra, và nút để thoát/thử lại.
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));
jest.mock('expo-video', () => ({
  VideoView: () => null,
  useVideoPlayer: () => ({}),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => false),
  shareAsync: jest.fn(),
}));
jest.mock('../components/media/save-to-library', () => ({ saveAssetToLibrary: jest.fn() }));
jest.mock('@/core/uploads/use-asset-url', () => ({
  useAssetUrl: () => ({
    data: { url: 'https://cdn.example/a' },
    isError: false,
    isLoading: false,
    refetch: jest.fn(),
  }),
}));

const getMessage = jest.spyOn(chatService, 'get');

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function tree(): ReactElement {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>
        <MediaViewerScreen initialIndex={0} messageId="m-1" />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const message = (attachments: unknown[]) => ({ attachments, id: 'm-1' }) as never;

beforeEach(() => jest.clearAllMocks());

describe('MediaViewerScreen — chưa có tệp để xem', () => {
  it('đang tải tin ⇒ có khung chờ và nút "Đóng" để thoát', async () => {
    getMessage.mockReturnValue(new Promise(() => undefined));
    await render(tree());

    await fireEvent.press(screen.getByRole('button', { name: 'Đóng' }));

    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('tải tin lỗi ⇒ báo lỗi bằng lời (không lộ Error.message), "Thử lại" gọi lại API, "Đóng" thoát', async () => {
    getMessage.mockRejectedValueOnce(new Error('ECONNRESET 10.0.0.1'));
    await render(tree());

    expect(
      await screen.findByText('Không tải được tệp. Kiểm tra kết nối rồi thử lại.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/ECONNRESET/)).toBeNull();

    getMessage.mockResolvedValueOnce(
      message([{ assetId: 'a-1', kind: 'IMAGE', mime: 'image/jpeg', name: 'a.jpg' }]),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));

    // Tải lại được ⇒ hết màn lỗi, thanh công cụ của trang ảnh xuất hiện.
    expect(await screen.findByRole('button', { name: 'Lưu về máy' })).toBeOnTheScreen();
    expect(screen.queryByText('Không tải được tệp. Kiểm tra kết nối rồi thử lại.')).toBeNull();
    expect(getMessage).toHaveBeenCalledTimes(2);
  });

  it('tin không còn ảnh/video (đã xoá) ⇒ nói rõ, không có "Thử lại" (thử lại chẳng ra gì)', async () => {
    getMessage.mockResolvedValueOnce(
      message([{ assetId: 'f-1', kind: 'FILE', mime: 'application/pdf', name: 'a.pdf' }]),
    );
    await render(tree());

    expect(await screen.findByText('Tệp này không còn để xem.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeOnTheScreen();
  });
});
