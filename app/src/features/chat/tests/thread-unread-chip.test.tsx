import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { notificationKeys, readStateService, type ThreadUnread, type WorkspaceUnread } from '@/core/notifications';
import { MessageExtensionScopeContext } from '@/shared/message-extensions';

import { ThreadSummary } from '../components/thread/ThreadSummary';
import { ThreadSummaryRow } from '../components/thread/ThreadSummaryRow';

/**
 * p1-06 app.md §3: `ThreadSummaryRow` hiện chấm "N mới" khi luồng có phản hồi chưa đọc. Số lấy từ `GET /me/unread?workspaceId=` →
 * `threads[Thread.id].unread`, khoá bằng `MessageView.threadRecordId` (KHÔNG phải id tin gốc — p1-06 điểm lệch #4).
 */
const root = { lastReplierIds: ['u1'], replyCount: 4, threadRecordId: 'thread-rec-1' };
const noop = jest.fn();
/** Chấm "N mới" chỉ đọc `unread`, nên các ca dưới chỉ khai `channelId`/`unread`; mốc seq điền mặc định cho đủ kiểu. */
const workspace = (threads: Record<string, Pick<ThreadUnread, 'channelId' | 'unread'>>): WorkspaceUnread => ({
  channels: {},
  threads: Object.fromEntries(
    Object.entries(threads).map(([id, t]) => [id, { ...t, lastReadSeq: 0, lastSeq: t.unread }]),
  ),
});

function setup(
  unread: WorkspaceUnread | undefined,
  scope: { workspaceId?: string } | null = { workspaceId: 'ws-1' },
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  if (unread) queryClient.setQueryData(notificationKeys.workspaceUnread('ws-1'), unread);
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MessageExtensionScopeContext.Provider
        value={
          scope ? { scopeId: 'ch-1', scopeType: 'CHANNEL', workspaceId: scope.workspaceId } : null
        }
      >
        {children}
      </MessageExtensionScopeContext.Provider>
    </QueryClientProvider>
  );
  return { queryClient, Wrapper };
}

describe('ThreadSummaryRow — chấm "N mới"', () => {
  it('có phản hồi chưa đọc → nhãn "3 mới" + nhãn trợ năng đọc "3 phản hồi mới"; chạm vẫn mở luồng', async () => {
    const onPress = jest.fn();
    await render(<ThreadSummaryRow message={root} unreadCount={3} onPress={onPress} />);

    expect(screen.getByText('3 mới')).toBeOnTheScreen();
    const row = screen.getByRole('button');
    expect(row.props.accessibilityLabel).toMatch(/3 phản hồi mới\. Mở luồng trả lời$/);
    await userEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('không có / bằng 0 → KHÔNG chấm, nhãn trợ năng không nhắc "mới"', async () => {
    await render(<ThreadSummaryRow message={root} onPress={noop} />);
    expect(screen.queryByText(/mới/)).toBeNull();
    expect(screen.getByRole('button').props.accessibilityLabel).not.toMatch(/mới/);

    await render(<ThreadSummaryRow message={root} unreadCount={0} onPress={noop} />);
    expect(screen.queryByText(/mới/)).toBeNull();
  });

  it('server chặn số đếm ở 100 → "99+ mới"', async () => {
    await render(<ThreadSummaryRow message={root} unreadCount={100} onPress={noop} />);

    expect(screen.getByText('99+ mới')).toBeOnTheScreen();
  });
});

describe('ThreadSummary — nối với /me/unread', () => {
  let getWorkspaceUnread: jest.SpyInstance;
  beforeEach(() => {
    getWorkspaceUnread = jest
      .spyOn(readStateService, 'getWorkspaceUnread')
      .mockResolvedValue(workspace({}));
  });
  afterEach(() => getWorkspaceUnread.mockRestore());

  it('luồng có trong `threads` theo Thread.id → hiện chấm; luồng khác không ảnh hưởng', async () => {
    const { Wrapper } = setup(
      workspace({
        'thread-rec-1': { channelId: 'ch-1', unread: 2 },
        'thread-rec-9': { channelId: 'ch-1', unread: 7 },
      }),
    );
    await render(<ThreadSummary message={root} onPress={noop} />, { wrapper: Wrapper });

    expect(await screen.findByText('2 mới')).toBeOnTheScreen();
    expect(screen.queryByText('7 mới')).toBeNull();
  });

  it('luồng không có mục trong `threads` (BE chỉ liệt kê luồng còn chưa đọc) → hàng tóm tắt KHÔNG chấm', async () => {
    const { Wrapper } = setup(workspace({ 'thread-rec-9': { channelId: 'ch-1', unread: 7 } }));
    await render(<ThreadSummary message={root} onPress={noop} />, { wrapper: Wrapper });

    expect(screen.getByText('4 phản hồi')).toBeOnTheScreen();
    expect(screen.queryByText(/mới/)).toBeNull();
  });

  it('khoá bằng Thread.id: mục `threads` mang id TIN GỐC không được nhận nhầm cho luồng này', async () => {
    const { Wrapper } = setup(workspace({ 'root-msg-1': { channelId: 'ch-1', unread: 5 } }));
    await render(<ThreadSummary message={root} onPress={noop} />, { wrapper: Wrapper });

    expect(screen.queryByText(/mới/)).toBeNull();
  });

  it('chưa có cache → tải /me/unread?workspaceId= đúng nhóm rồi hiện chấm', async () => {
    getWorkspaceUnread.mockResolvedValue(
      workspace({ 'thread-rec-1': { channelId: 'ch-1', unread: 4 } }),
    );
    const { Wrapper } = setup(undefined);
    await render(<ThreadSummary message={root} onPress={noop} />, { wrapper: Wrapper });

    expect(await screen.findByText('4 mới')).toBeOnTheScreen();
    expect(getWorkspaceUnread).toHaveBeenCalledWith('ws-1');
  });

  it('tin chưa có luồng (replyCount vắng/0) → không vẽ gì và KHÔNG gọi API', async () => {
    const { Wrapper } = setup(undefined);
    await render(<ThreadSummary message={{ threadRecordId: 'thread-rec-1' }} onPress={noop} />, {
      wrapper: Wrapper,
    });

    expect(screen.queryByRole('button')).toBeNull();
    expect(getWorkspaceUnread).not.toHaveBeenCalled();
  });

  it('không biết workspace (hội thoại, ngoài ChatRoom) → vẽ hàng KHÔNG chấm, không gọi API', async () => {
    const { Wrapper } = setup(undefined, {});
    await render(<ThreadSummary message={root} onPress={noop} />, { wrapper: Wrapper });

    expect(screen.getByText('4 phản hồi')).toBeOnTheScreen();
    expect(screen.queryByText(/mới/)).toBeNull();
    expect(getWorkspaceUnread).not.toHaveBeenCalled();
  });

  it('BE cũ chưa có threadRecordId → vẽ hàng KHÔNG chấm, không gọi API', async () => {
    const { Wrapper } = setup(undefined);
    await render(<ThreadSummary message={{ replyCount: 4 }} onPress={noop} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByText('4 phản hồi')).toBeOnTheScreen();
    expect(getWorkspaceUnread).not.toHaveBeenCalled();
  });
});
