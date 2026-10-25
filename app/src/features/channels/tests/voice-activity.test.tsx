import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useAuthStore } from '@/shell/store/slices/auth';

import type { ChannelListItem as ChannelListItemData, ChannelListResponse } from '../api';
import { ChannelListItem } from '../components/ChannelListItem';
import { useChannelSocket } from '../hooks/useChannelSocket';
import { channelKeys } from '../queries/channels.keys';

/** p2-03 app.md §4: danh sách kênh hiện "N người đang trong phòng" (CHỮ, không chỉ icon) và cập nhật realtime theo `channel:voice-activity`. */
const mockHandlers = new Map<string, (payload: unknown) => void>();
jest.mock('@/core/socket', () => ({
  SocketEvent: jest.requireActual('@/core/socket/socket.events').SocketEvent,
  useSocketEvent: (event: string, handler: (payload: unknown) => void) => {
    mockHandlers.set(event, handler);
  },
}));

const channel = (over: Partial<ChannelListItemData> = {}): ChannelListItemData => ({
  id: 'v1',
  isDefault: false,
  lastMessageAt: null,
  name: 'phong-hoc',
  notifyMode: 'INHERIT',
  pinned: false,
  position: 0,
  postingPolicy: 'MEMBERS',
  status: 'ACTIVE',
  type: 'VOICE',
  visibility: 'PUBLIC',
  ...over,
});

describe('ChannelListItem — phòng thoại', () => {
  it('kênh VOICE đang có người: nhãn chữ "3 người đang trong phòng" (cả nhãn trợ năng)', async () => {
    await render(<ChannelListItem channel={channel({ voice: { callId: 'c1', count: 3 } })} onPress={jest.fn()} />);
    expect(screen.getByText('3 người đang trong phòng')).toBeOnTheScreen();
    expect(screen.getByLabelText(/3 người đang trong phòng/)).toBeOnTheScreen();
  });

  it('phòng trống / kênh chữ: không có nhãn', async () => {
    await render(<ChannelListItem channel={channel()} onPress={jest.fn()} />);
    expect(screen.queryByText(/người đang trong phòng/)).toBeNull();
  });
});

describe('useChannelSocket — channel:voice-activity', () => {
  const list = (): ChannelListResponse => ({ discoverable: [channel({ id: 'v2', name: 'phong-khac' })], joined: [channel(), channel({ id: 't1', name: 'chung', type: 'TEXT' })] });

  async function mount() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
    queryClient.setQueryData<ChannelListResponse>(channelKeys.list('ws1'), list());
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    await renderHook(() => useChannelSocket('ws1'), { wrapper });
    return queryClient;
  }
  const emit = (payload: unknown) => act(() => mockHandlers.get('channel:voice-activity')?.(payload));
  const voiceOf = (queryClient: QueryClient, id: string) => {
    const data = queryClient.getQueryData<ChannelListResponse>(channelKeys.list('ws1'));
    return [...(data?.joined ?? []), ...(data?.discoverable ?? [])].find((c) => c.id === id)?.voice;
  };

  beforeEach(() => {
    mockHandlers.clear();
    useAuthStore.setState({ user: { id: 'me' } } as never);
  });

  it('có người vào phòng → gắn `voice` cho đúng kênh (đã vào lẫn khám phá), kênh khác không đổi', async () => {
    const queryClient = await mount();
    await emit({ channelId: 'v1', v: 1, voice: { callId: 'c1', count: 2 }, workspaceId: 'ws1' });
    await emit({ channelId: 'v2', v: 1, voice: { callId: 'c2', count: 1 }, workspaceId: 'ws1' });
    expect(voiceOf(queryClient, 'v1')).toEqual({ callId: 'c1', count: 2 });
    expect(voiceOf(queryClient, 'v2')).toEqual({ callId: 'c2', count: 1 });
    expect(voiceOf(queryClient, 't1')).toBeUndefined();
  });

  it('phòng kết thúc (callId null) hoặc 0 người → bỏ nhãn, không để "0 người" lại', async () => {
    const queryClient = await mount();
    await emit({ channelId: 'v1', v: 1, voice: { callId: 'c1', count: 2 }, workspaceId: 'ws1' });
    await emit({ channelId: 'v1', v: 1, voice: { callId: null, count: 0 }, workspaceId: 'ws1' });
    expect(voiceOf(queryClient, 'v1')).toBeUndefined();
  });

  it('sự kiện của nhóm khác → bỏ qua; đây KHÔNG phải `channel:activity` nên không cộng chưa đọc', async () => {
    const queryClient = await mount();
    await emit({ channelId: 'v1', v: 1, voice: { callId: 'c1', count: 2 }, workspaceId: 'ws-khac' });
    expect(voiceOf(queryClient, 'v1')).toBeUndefined();
    await emit({ channelId: 'v1', v: 1, voice: { callId: 'c1', count: 2 }, workspaceId: 'ws1' });
    const data = queryClient.getQueryData<ChannelListResponse>(channelKeys.list('ws1'));
    expect(data?.joined.find((c) => c.id === 'v1')?.unreadCount).toBeUndefined();
  });
});
