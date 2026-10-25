import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { WorkspaceUnread } from '@/core/notifications';

import { channelsService, type ChannelListItem as ChannelListItemData } from '../api';
import { ChannelListItem } from '../components/ChannelListItem';
import { withChannelUnread } from '../screens/channel-list.utils';
import { ChannelListScreen } from '../screens/ChannelListScreen';

/**
 * p1-07 app.md §3 "Badge": danh sách kênh hiện chấm/số chưa đọc THẬT. `GET /workspaces/:id/channels` không trả số này, nên màn danh sách
 * gộp từ `GET /me/unread?workspaceId=` (`useWorkspaceUnread` — đã được socket + mốc đọc vá live). Trước đây `ChannelListItem` đọc
 * `channel.unreadCount` (luôn vắng) và `useChannelSocket` +1 mãi không hạ về 0.
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ wsId: 'ws-1' }),
}));
jest.mock('@/core/socket', () => ({
  SocketEvent: jest.requireActual('@/core/socket/socket.events').SocketEvent,
  useSocketEvent: jest.fn(),
}));
const mockUnread = { data: undefined as WorkspaceUnread | undefined, refetch: jest.fn() };
jest.mock('@/shell/notifications', () => ({ useWorkspaceUnread: () => mockUnread }));
jest.mock('../api/channels.service', () => ({
  channelsService: {
    list: jest.fn(),
    search: jest.fn(async () => []),
    workspacePermissions: jest.fn(async () => ({ myPermissions: { canCreateChannel: false } })),
  },
}));

const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

const channel = (over: Partial<ChannelListItemData> = {}): ChannelListItemData => ({
  id: 'c1',
  isDefault: false,
  lastMessageAt: null,
  name: 'chung',
  notifyMode: 'INHERIT',
  pinned: false,
  position: 0,
  postingPolicy: 'MEMBERS',
  status: 'ACTIVE',
  type: 'TEXT',
  visibility: 'PUBLIC',
  ...over,
});

const unread = (channels: WorkspaceUnread['channels']): WorkspaceUnread => ({
  channels,
  threads: {},
});

describe('withChannelUnread', () => {
  it('gắn số chưa đọc/nhắc tên/trần đếm vào ĐÚNG kênh, kênh khác giữ nguyên', () => {
    const items = [channel({ id: 'a' }), channel({ id: 'b', name: 'thiet-ke' })];
    const merged = withChannelUnread(
      items,
      unread({ a: { capped: true, lastReadSeq: 0, lastSeq: 9, mentions: 2, unread: 100 } }),
    );

    expect(merged[0]).toMatchObject({ mentionCount: 2, unreadCapped: true, unreadCount: 100 });
    expect(merged[1]).toBe(items[1]); // không có mục trong /me/unread → không bịa "0"
  });

  it('chưa có dữ liệu (đang tải/mất mạng) → trả NGUYÊN mảng, không vẽ lại thừa', () => {
    const items = [channel()];

    expect(withChannelUnread(items, undefined)).toBe(items);
  });

  it('kênh đã đọc hết (unread 0) ghi đè số cũ về 0 — chấm phải hạ xuống', () => {
    const merged = withChannelUnread(
      [channel({ mentionCount: 5, unreadCount: 7 })],
      unread({ c1: { capped: false, lastReadSeq: 20, lastSeq: 20, mentions: 0, unread: 0 } }),
    );

    expect(merged[0]).toMatchObject({ mentionCount: 0, unreadCapped: false, unreadCount: 0 });
  });
});

describe('ChannelListItem — nhãn chưa đọc', () => {
  it('chưa đọc → số + nhãn trợ năng; nhắc tên ưu tiên hơn số chưa đọc', async () => {
    await render(<ChannelListItem channel={channel({ unreadCount: 4 })} onPress={jest.fn()} />);
    expect(screen.getByText('4')).toBeOnTheScreen();
    expect(screen.getByLabelText('chung, 4 tin chưa đọc')).toBeOnTheScreen();

    await render(
      <ChannelListItem
        channel={channel({ mentionCount: 2, unreadCount: 9 })}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('chung, 2 nhắc đến bạn')).toBeOnTheScreen();
  });

  it('server đếm chạm trần → chữ "99+" và đọc "100+ tin chưa đọc"', async () => {
    await render(
      <ChannelListItem
        channel={channel({ unreadCapped: true, unreadCount: 100 })}
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByText('99+')).toBeOnTheScreen();
    expect(screen.getByLabelText('chung, 100+ tin chưa đọc')).toBeOnTheScreen();
  });

  it('đã đọc hết (0) hoặc chưa có số → không có huy hiệu', async () => {
    await render(<ChannelListItem channel={channel({ unreadCount: 0 })} onPress={jest.fn()} />);
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.getByLabelText('chung')).toBeOnTheScreen();
  });
});

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

describe('ChannelListScreen — số chưa đọc thật', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(channelsService.list).mockResolvedValue({
      discoverable: [],
      joined: [
        channel({ id: 'a', name: 'chung', position: 0 }),
        channel({ id: 'b', name: 'thiet-ke', position: 1 }),
        channel({ id: 'c', name: 'da-doc', position: 2 }),
      ],
    });
  });

  it('gộp /me/unread vào danh sách: kênh có tin mới hiện số, kênh có nhắc tên hiện nhắc tên, kênh đã đọc không có huy hiệu', async () => {
    mockUnread.data = unread({
      a: { capped: false, lastReadSeq: 7, lastSeq: 12, mentions: 0, unread: 5 },
      b: { capped: false, lastReadSeq: 5, lastSeq: 8, mentions: 2, unread: 3 },
      c: { capped: false, lastReadSeq: 4, lastSeq: 4, mentions: 0, unread: 0 },
    });
    await render(<ChannelListScreen />, { wrapper: Wrapper });

    expect(await screen.findByLabelText('chung, 5 tin chưa đọc')).toBeOnTheScreen();
    expect(screen.getByLabelText('thiet-ke, 2 nhắc đến bạn')).toBeOnTheScreen();
    expect(screen.getByLabelText('da-doc')).toBeOnTheScreen();
  });

  it('chưa tải được /me/unread → danh sách vẫn hiện, không bịa số', async () => {
    mockUnread.data = undefined;
    await render(<ChannelListScreen />, { wrapper: Wrapper });

    expect(await screen.findByLabelText('chung')).toBeOnTheScreen();
    expect(screen.queryByText('5')).toBeNull();
  });
});
