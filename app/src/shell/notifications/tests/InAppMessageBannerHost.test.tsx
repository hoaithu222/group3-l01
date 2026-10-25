import { act, render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useInAppBannerStore, type InAppBanner } from '@/core/notifications';

import { IN_APP_BANNER_MS, InAppMessageBannerHost } from '../InAppMessageBannerHost';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

const BANNER: InAppBanner = {
  body: 'An: đã gửi tin nhắn',
  id: 'n-1',
  payload: {
    scopeId: 'conv-1',
    scopeType: 'CONVERSATION',
    targetUserId: 'me',
    type: 'message.new',
  },
  title: 'Nhóm Đồ án',
};

async function renderHost() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <InAppMessageBannerHost />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(router.push).mockClear();
  useInAppBannerStore.getState().dismiss();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('InAppMessageBannerHost', () => {
  it('không có banner → không vẽ gì', async () => {
    await renderHost();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('hiện tiêu đề + nội dung (đúng như BE soạn theo màn hình khoá), nhãn trợ năng gộp cả hai', async () => {
    await renderHost();
    await act(async () => useInAppBannerStore.getState().show(BANNER));

    expect(screen.getByText('Nhóm Đồ án')).toBeOnTheScreen();
    expect(screen.getByText('An: đã gửi tin nhắn')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Nhóm Đồ án. An: đã gửi tin nhắn' })).toBeOnTheScreen();
  });

  it('tự ẩn sau 4 giây', async () => {
    await renderHost();
    await act(async () => useInAppBannerStore.getState().show(BANNER));
    await act(async () => {
      jest.advanceTimersByTime(IN_APP_BANNER_MS + 50);
    });
    expect(screen.queryByText('Nhóm Đồ án')).toBeNull();
  });

  it('chạm → đóng banner và mở ĐÚNG cuộc trò chuyện (cùng bảng type → route với chạm push)', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderHost();
    await act(async () => useInAppBannerStore.getState().show(BANNER));

    await user.press(screen.getByRole('button', { name: /Nhóm Đồ án/ }));

    expect(router.push).toHaveBeenCalledWith({
      params: { conversationId: 'conv-1' },
      pathname: '/messages/[conversationId]',
    });
    expect(useInAppBannerStore.getState().banner).toBeNull();
  });

  it('banner mới thay banner cũ; lệnh tự ẩn của banner CŨ không xoá nhầm banner mới', async () => {
    await renderHost();
    await act(async () => useInAppBannerStore.getState().show(BANNER));
    await act(async () => {
      jest.advanceTimersByTime(IN_APP_BANNER_MS - 500);
    });
    await act(async () => useInAppBannerStore.getState().show({ ...BANNER, id: 'n-2', title: 'Tin mới hơn' }));
    await act(async () => {
      jest.advanceTimersByTime(600); // quá hạn của banner cũ
    });

    expect(screen.getByText('Tin mới hơn')).toBeOnTheScreen();
  });
});
