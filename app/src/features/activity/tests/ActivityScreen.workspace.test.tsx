import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { inboxService, type InboxItem } from '@/core/notifications';

import { activityService } from '../api/activity.service';
import { ActivityScreen } from '../screens/ActivityScreen';

/**
 * Hộp thư Hoạt động — mục nhóm làm việc (`workspace.*`: câu riêng, biểu tượng thay avatar "?", tra tên nhóm, mở tổng quan nhóm) và ca lọc-mà-rỗng.
 * Tách khỏi `ActivityScreen.test.tsx` để giữ dưới trần 200 dòng.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
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

const page = (data: InboxItem[]) => ({
  data,
  meta: { hasMore: false, limit: 30, nextCursor: null },
});

const listSpy = jest.spyOn(inboxService, 'list');
const markReadSpy = jest.spyOn(inboxService, 'markRead');
const readAllSpy = jest.spyOn(inboxService, 'readAll');
const workspacesSpy = jest.spyOn(activityService, 'listWorkspaces');

let queryClient: QueryClient;

async function renderScreen() {
  queryClient = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: 0 },
      queries: { gcTime: Infinity, retry: false, staleTime: 0 },
    },
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

describe('ActivityScreen — mục nhóm làm việc', () => {
  it('workspace.member-added: câu riêng (không "Bạn có thông báo mới"), không avatar "?", chạm mở tổng quan nhóm', async () => {
    listSpy.mockResolvedValue(
      page([
        item({
          actor: null,
          context: { available: true, muted: false },
          refs: { workspaceId: 'ws-1', workspaceName: 'Đồ án' },
          scopeId: 'ws-1',
          scopeType: 'WORKSPACE',
          type: 'workspace.member-added',
        }),
      ]),
    );
    await renderScreen();

    expect(await screen.findByText('Bạn được thêm vào nhóm Đồ án')).toBeOnTheScreen();
    expect(screen.queryByText('Bạn có thông báo mới')).toBeNull();
    expect(screen.queryByText('?')).toBeNull();

    await userEvent.press(screen.getByRole('button', { name: /được thêm vào nhóm Đồ án/ }));
    expect(router.push).toHaveBeenCalledWith({
      params: { wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]',
    });
  });

  it('workspace.admin-change chỉ có id nhóm: tên nhóm tra từ danh sách nhóm của tôi', async () => {
    listSpy.mockResolvedValue(
      page([
        item({
          actor: null,
          context: { available: true, muted: false },
          refs: { action: 'role-changed', role: 'ADMIN', workspaceId: 'ws-1' },
          scopeId: 'ws-1',
          scopeType: 'WORKSPACE',
          type: 'workspace.admin-change',
        }),
      ]),
    );
    await renderScreen();

    expect(
      await screen.findByText('Vai trò của bạn trong nhóm Đồ án đã đổi thành Quản trị viên'),
    ).toBeOnTheScreen();
  });
});

describe('ActivityScreen — bộ lọc', () => {
  it('đang lọc mà rỗng → nói rõ là bộ lọc và "Bỏ lọc" đưa về tab "Tất cả"', async () => {
    listSpy.mockImplementation(async (params) =>
      page(params?.filter === 'mentions' ? [] : [item()]),
    );
    await renderScreen();
    await screen.findByText('Minh nhắc đến bạn trong #frontend');
    await userEvent.press(screen.getByText('Nhắc đến bạn'));

    expect(await screen.findByText('Không có hoạt động nào khớp bộ lọc')).toBeOnTheScreen();
    expect(screen.queryByText('Chưa có hoạt động cần chú ý')).toBeNull();

    await userEvent.press(screen.getByRole('button', { name: 'Bỏ lọc' }));
    expect(await screen.findByText('Minh nhắc đến bạn trong #frontend')).toBeOnTheScreen();
    expect(screen.queryByText('Không có hoạt động nào khớp bộ lọc')).toBeNull();
  });
});

describe('ActivityScreen — nhóm ngày', () => {
  it('chèn nhãn "Hôm nay" / "Hôm qua" giữa các mục, vai `header`', async () => {
    // 12h trưa hôm qua THEO LỊCH (không trừ 24 giờ: chạy lúc 1h sáng thì 30 giờ trước đã là hôm kia).
    const now = new Date();
    const yesterday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 1,
      12,
    ).toISOString();
    listSpy.mockResolvedValue(
      page([item({ id: 'n-1' }), item({ createdAt: yesterday, id: 'n-2', readAt: yesterday })]),
    );
    await renderScreen();

    expect(await screen.findByRole('header', { name: 'Hôm nay' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Hôm qua' })).toBeOnTheScreen();
  });
});
