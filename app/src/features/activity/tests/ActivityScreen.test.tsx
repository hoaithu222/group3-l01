import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { inboxService, notificationKeys, type InboxItem } from '@/core/notifications';
import { showToast } from '@/shared/utils/toast.utils';

import { activityService } from '../api/activity.service';
import { ActivityScreen } from '../screens/ActivityScreen';

/**
 * p1-07 `app.md` §3/§8: hộp thư Hoạt động — tab lọc, mở đúng tin (đánh dấu đọc lạc quan), "Đọc tất cả" nêu phạm vi và gửi
 * `before` = lúc tải danh sách, mục mất quyền không lộ nội dung.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@shopify/flash-list', () => ({ FlashList: jest.requireActual('react-native').FlatList }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
// `useCapabilities` đặt gcTime 24 giờ → timer treo; cờ phân hệ giả bằng `useFeature`.
jest.mock('@/shell/capabilities', () => ({ useFeature: () => true }));

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function item(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    actor: { avatarUrl: null, name: 'Minh', userId: 'u-minh' },
    actorId: 'u-minh',
    context: { available: true, excerpt: 'Xem giúp mình nhé', muted: false, scopeName: 'frontend' },
    createdAt: new Date().toISOString(),
    id: 'n-1',
    kind: 'MENTION',
    messageId: 'm-1',
    muted: false,
    readAt: null,
    refs: { messageId: 'm-1' },
    scopeId: 'ch-1',
    scopeType: 'CHANNEL',
    threadId: null,
    type: 'mention',
    unavailable: false,
    workspaceId: 'ws-1',
    ...overrides,
  };
}

const page = (data: InboxItem[]) => ({ data, meta: { hasMore: false, limit: 30, nextCursor: null } });

const listSpy = jest.spyOn(inboxService, 'list');
const markReadSpy = jest.spyOn(inboxService, 'markRead');
const readAllSpy = jest.spyOn(inboxService, 'readAll');
const workspacesSpy = jest.spyOn(activityService, 'listWorkspaces');

let queryClient: QueryClient;

async function renderScreen() {
  queryClient = new QueryClient({
    defaultOptions: { mutations: { gcTime: 0 }, queries: { gcTime: Infinity, retry: false, staleTime: 0 } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(<ActivityScreen />, { wrapper: Wrapper });
}

beforeEach(() => {
  jest.clearAllMocks();
  listSpy.mockReset().mockResolvedValue(page([item()]));
  markReadSpy.mockReset().mockResolvedValue({ id: 'n-1', readAt: new Date().toISOString() });
  readAllSpy.mockReset().mockResolvedValue({ updated: 1 });
  workspacesSpy.mockReset().mockResolvedValue([{ id: 'ws-1', name: 'Đồ án' }]);
});

describe('ActivityScreen — hiển thị', () => {
  it('mục nhắc tên: câu mô tả + trích đoạn; nhãn trợ năng nói "chưa đọc"', async () => {
    await renderScreen();
    expect(await screen.findByText('Minh nhắc đến bạn trong #frontend')).toBeOnTheScreen();
    expect(screen.getByText('Xem giúp mình nhé')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /chưa đọc/ })).toBeOnTheScreen();
  });

  it('rỗng → "Chưa có hoạt động cần chú ý" kèm mô tả các loại', async () => {
    listSpy.mockResolvedValue(page([]));
    await renderScreen();
    expect(await screen.findByText('Chưa có hoạt động cần chú ý')).toBeOnTheScreen();
    expect(screen.getByText(/Nhắc đến bạn, trả lời luồng/)).toBeOnTheScreen();
  });

  it('lỗi tải → nút "Thử lại" gọi lại API', async () => {
    listSpy.mockRejectedValueOnce(new Error('mạng'));
    await renderScreen();
    await userEvent.press(await screen.findByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(2));
  });

  it('⛔ mục MẤT QUYỀN: chỉ "Nội dung không còn khả dụng", không tên người/kênh', async () => {
    listSpy.mockResolvedValue(
      page([item({ actor: null, actorId: null, context: { available: false, muted: false }, refs: null, scopeId: null, unavailable: true })]),
    );
    await renderScreen();
    expect(await screen.findByText('Nội dung không còn khả dụng')).toBeOnTheScreen();
    expect(screen.queryByText(/Minh|frontend/)).toBeNull();
  });
});

describe('ActivityScreen — mở một mục', () => {
  it('chạm mục chưa đọc → đánh dấu đọc (lạc quan) rồi mở ĐÚNG tin ở kênh', async () => {
    await renderScreen();
    await userEvent.press(await screen.findByRole('button', { name: /nhắc đến bạn/ }));

    expect(markReadSpy).toHaveBeenCalledWith('n-1');
    expect(router.push).toHaveBeenCalledWith({
      params: { chId: 'ch-1', m: 'm-1', wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/channels/[chId]',
    });
    // Lạc quan: mục đã hết "chưa đọc" ngay, không đợi server.
    const cached = queryClient.getQueryData<{ pages: { data: InboxItem[] }[] }>(
      notificationKeys.inboxList({ filter: 'all', workspaceId: undefined }),
    );
    expect(cached?.pages[0]?.data[0]?.readAt).not.toBeNull();
  });

  it('trả lời luồng → mở màn luồng của TIN GỐC (threadId của mục là id tin gốc)', async () => {
    listSpy.mockResolvedValue(
      page([item({ kind: 'THREAD_REPLY', messageId: 'reply-1', refs: {}, threadId: 'root-1', type: 'thread.reply' })]),
    );
    await renderScreen();
    await userEvent.press(await screen.findByRole('button', { name: /trả lời luồng/ }));

    expect(router.push).toHaveBeenCalledWith({
      params: { chId: 'ch-1', m: 'reply-1', messageId: 'root-1', wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/channels/[chId]/thread/[messageId]',
    });
  });

  it('mục mất quyền: vẫn đánh dấu đọc nhưng KHÔNG điều hướng, toast trung tính', async () => {
    listSpy.mockResolvedValue(
      page([item({ actor: null, context: { available: false, muted: false }, refs: null, scopeId: null, unavailable: true })]),
    );
    await renderScreen();
    await userEvent.press(await screen.findByRole('button', { name: /không còn khả dụng/ }));

    expect(markReadSpy).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('info', 'Nội dung không còn khả dụng.');
  });

  it('họp thiếu meetingId (không dựng được đích) → toast trung tính thay vì điều hướng hỏng', async () => {
    listSpy.mockResolvedValue(page([item({ refs: {}, type: 'meeting.invited' })]));
    await renderScreen();
    await userEvent.press(await screen.findByRole('button', { name: /cuộc họp/ }));
    expect(router.push).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('info', 'Không mở được thông báo này.');
  });
});

describe('ActivityScreen — lọc và đọc tất cả', () => {
  it('đổi tab "Nhắc đến bạn" → gọi API với filter=mentions', async () => {
    await renderScreen();
    await screen.findByText('Minh nhắc đến bạn trong #frontend');
    await userEvent.press(screen.getByText('Nhắc đến bạn'));

    await waitFor(() => expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ filter: 'mentions' })));
  });

  it('"Đọc tất cả" nêu rõ PHẠM VI, xác nhận rồi gửi filter + before (thời điểm tải danh sách)', async () => {
    await renderScreen();
    await screen.findByText('Minh nhắc đến bạn trong #frontend');
    const loadedAt = Date.now();

    await userEvent.press(screen.getByRole('button', { name: 'Đọc tất cả' }));
    expect(screen.getByText(/các mục trong "Tất cả"/)).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Đánh dấu đã đọc' }));

    await waitFor(() => expect(readAllSpy).toHaveBeenCalledTimes(1));
    const payload = readAllSpy.mock.calls[0]?.[0];
    expect(payload).toMatchObject({ filter: 'all' });
    // `before` là lúc TẢI danh sách (trước lúc bấm) — tin đến sau đó vẫn chưa đọc (NT-13).
    expect(new Date(payload?.before ?? '').getTime()).toBeLessThanOrEqual(loadedAt + 1000);
  });

  it('không có mục chưa đọc → không hiện nút "Đọc tất cả"', async () => {
    listSpy.mockResolvedValue(page([item({ readAt: '2026-09-21T09:00:00.000Z' })]));
    await renderScreen();
    await screen.findByText('Minh nhắc đến bạn trong #frontend');
    expect(screen.queryByRole('button', { name: 'Đọc tất cả' })).toBeNull();
  });
});
