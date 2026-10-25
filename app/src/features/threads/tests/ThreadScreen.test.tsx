import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, userEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ChatRoomProps } from '@/features/chat';

import { threadsService } from '../api';
import { ThreadScreen } from '../screens/ThreadScreen';
import { makeRootMessage, makeRootResult, makeThread } from './fixtures';

let chatRoomProps: ChatRoomProps | undefined;

jest.mock('@/features/chat', () => ({
  ...jest.requireActual('@/features/chat'),
  ChatRoom: (props: ChatRoomProps) => {
    chatRoomProps = props;
    return null;
  },
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ wsId: 'ws-1', chId: 'ch-1', messageId: 'root-1', m: 'reply-7' }),
}));
jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'),
);
jest.mock('../api', () => ({
  threadsService: {
    getByRoot: jest.fn(),
    getChannelBrief: jest.fn(),
    listChannelMembers: jest.fn(),
    setSubscription: jest.fn(),
  },
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

async function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(<ThreadScreen />, { wrapper: Wrapper });
}

describe('ThreadScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chatRoomProps = undefined;
    jest
      .mocked(threadsService.getChannelBrief)
      .mockResolvedValue({ id: 'ch-1', name: 'chung', myPermissions: { canWrite: true } });
    jest
      .mocked(threadsService.listChannelMembers)
      .mockResolvedValue({ items: [], page: 1, hasNext: false });
    jest.mocked(threadsService.getByRoot).mockResolvedValue(makeRootResult());
    jest
      .mocked(threadsService.setSubscription)
      .mockImplementation(async (threadId, state) => ({ threadId, state }));
  });

  it('dựng ChatRoom ở scope LUỒNG (threadId = tin gốc), mở quanh ?m=, và tiêu đề có tên kênh', async () => {
    const screen = await renderScreen();
    await waitFor(() => expect(chatRoomProps).toBeDefined());
    expect(chatRoomProps?.scope).toEqual({
      scopeType: 'CHANNEL',
      scopeId: 'ch-1',
      threadId: 'root-1',
    });
    expect(chatRoomProps?.initialMessageId).toBe('reply-7');
    expect(chatRoomProps?.emptyHint).toBe('Chưa có phản hồi. Hãy bắt đầu cuộc thảo luận.');
    expect(screen.getByText('Luồng')).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByText('chung')).toBeOnTheScreen());
    expect(screen.getByText(/^Tin gốc · /)).toBeOnTheScreen();
  });

  it('TH-02: mở màn luồng CHƯA có phản hồi không tạo gì — không có nút Theo dõi, không gọi PUT', async () => {
    jest.mocked(threadsService.getByRoot).mockResolvedValue(makeRootResult({ thread: null }));
    const screen = await renderScreen();
    await waitFor(() => expect(chatRoomProps).toBeDefined());
    expect(screen.queryByText('Theo dõi')).toBeNull();
    expect(screen.queryByText('Đang theo dõi')).toBeNull();
    expect(threadsService.setSubscription).not.toHaveBeenCalled();
  });

  it('đang theo dõi (AUTO_ON) → "Đang theo dõi"; chạm bỏ theo dõi = EXPLICIT_OFF, nhãn đổi ngay (lạc quan)', async () => {
    const screen = await renderScreen();
    await userEvent.press(await screen.findByText('Đang theo dõi'));
    await waitFor(() =>
      expect(threadsService.setSubscription).toHaveBeenCalledWith('t-1', 'EXPLICIT_OFF'),
    );
    await waitFor(() => expect(screen.getByText('Theo dõi')).toBeOnTheScreen());
  });

  it('EXPLICIT_OFF → "Theo dõi"; chạm bật lại = EXPLICIT_ON', async () => {
    jest
      .mocked(threadsService.getByRoot)
      .mockResolvedValue(
        makeRootResult({ thread: makeThread({ mySubscription: 'EXPLICIT_OFF' }) }),
      );
    const screen = await renderScreen();
    await userEvent.press(await screen.findByText('Theo dõi'));
    await waitFor(() =>
      expect(threadsService.setSubscription).toHaveBeenCalledWith('t-1', 'EXPLICIT_ON'),
    );
  });

  it('PUT lỗi → khôi phục nhãn cũ (không nói dối trạng thái theo dõi)', async () => {
    jest.mocked(threadsService.setSubscription).mockRejectedValue(new Error('offline'));
    const screen = await renderScreen();
    await userEvent.press(await screen.findByText('Đang theo dõi'));
    await waitFor(() => expect(threadsService.setSubscription).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Đang theo dõi')).toBeOnTheScreen());
  });

  it('quyền gửi lấy từ KÊNH (ADMINS_ONLY → MEMBER không trả lời được, CH-06)', async () => {
    jest
      .mocked(threadsService.getChannelBrief)
      .mockResolvedValue({ id: 'ch-1', name: 'thông báo', myPermissions: { canWrite: false } });
    await renderScreen();
    await waitFor(() => expect(chatRoomProps?.capabilities.canWrite).toBe(false));
  });

  it('tin gốc đã thu hồi: hiện tombstone nhưng luồng vẫn mở và gửi được (MSG-35)', async () => {
    jest
      .mocked(threadsService.getByRoot)
      .mockResolvedValue(
        makeRootResult({ root: makeRootMessage({ deleted: true, content: null, replyCount: 4 }) }),
      );
    const screen = await renderScreen();
    await waitFor(() => expect(screen.getByText('Tin nhắn đã được thu hồi')).toBeOnTheScreen());
    await waitFor(() => expect(chatRoomProps?.capabilities.canWrite).toBe(true));
  });

  it('không tải được tin gốc (vd 404 / MSG_019) → EmptyState + Thử lại, KHÔNG dựng ChatRoom', async () => {
    // `useThreadByRoot` tự thử lại 1 lần (retry: 1, trễ ~1 s) nên cả hai lượt đều phải lỗi mới ra trạng thái lỗi.
    jest.mocked(threadsService.getByRoot).mockRejectedValue(new Error('Không tìm thấy'));
    const screen = await renderScreen();
    expect(
      await screen.findByText('Không tải được', undefined, { timeout: 4000 }),
    ).toBeOnTheScreen();
    expect(chatRoomProps).toBeUndefined();

    jest.mocked(threadsService.getByRoot).mockResolvedValue(makeRootResult());
    await userEvent.press(screen.getByText('Thử lại'));
    await waitFor(() => expect(chatRoomProps).toBeDefined());
  });
});
