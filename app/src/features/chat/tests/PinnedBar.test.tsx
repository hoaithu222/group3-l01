import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useAuthStore } from '@/shell/store/slices/auth';

import { chatService } from '../api/chat.service';
import type { ResolveChatAuthor } from '../api/chat.types';
import { makeMessage, SCOPE } from '../cache/apply-socket-event.fixtures';
import { PinnedBar } from '../components/pinned/PinnedBar';

/**
 * Thanh tin đã ghim đầu phòng chat (kiểu Zalo): hiện tin MỚI ghim trước, chạm thanh nhảy tới tin rồi xoay sang tin kế, "N ghim"
 * mở danh sách; không có tin ghim (hoặc đã thu hồi hết) thì không vẽ gì. Nguồn dữ liệu là `chatService.listPins` (server sắp mới → cũ).
 */
jest.mock('../api/chat.service', () => ({ chatService: { listPins: jest.fn() } }));

const mockedListPins = jest.mocked(chatService.listPins);

const NEWEST = makeMessage({ id: 'msg-1', authorId: 'u-an', content: 'Họp 9h sáng mai phòng B2', pinnedAt: '2026-09-27T09:00:00.000Z' });
const OLDER = makeMessage({ id: 'msg-2', authorId: 'u-binh', content: 'Deadline nộp báo cáo thứ Sáu', pinnedAt: '2026-09-26T09:00:00.000Z' });

const NAMES: Record<string, string> = { 'u-an': 'Nguyễn An', 'u-binh': 'Trần Bình' };
const resolveAuthor: ResolveChatAuthor = (userId) => (NAMES[userId] ? { name: NAMES[userId] } : undefined);

async function renderBar(props: { onJump?: jest.Mock; onOpenList?: jest.Mock } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const onJump = props.onJump ?? jest.fn();
  const onOpenList = props.onOpenList ?? jest.fn();
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  const screen = await render(<PinnedBar resolveAuthor={resolveAuthor} scope={SCOPE} onJump={onJump} onOpenList={onOpenList} />, { wrapper: Wrapper });
  // React Query báo observer qua `setTimeout(0)` — xả trong `act` để dữ liệu đã có trong cây trước khi assert.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { ...screen, onJump, onOpenList };
}

describe('PinnedBar', () => {
  beforeEach(() => {
    mockedListPins.mockReset();
    useAuthStore.setState({ user: { id: 'u-me' } as never });
  });

  it('không có tin ghim nào ⇒ không vẽ gì (không chiếm chỗ)', async () => {
    mockedListPins.mockResolvedValue([]);
    const screen = await renderBar();

    await waitFor(() => expect(mockedListPins).toHaveBeenCalledWith(SCOPE));
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('hiện tin MỚI ghim nhất: tên người viết + nội dung + "1/N" + "N ghim"', async () => {
    mockedListPins.mockResolvedValue([NEWEST, OLDER]);
    const screen = await renderBar();

    expect(await screen.findByText('Tin nhắn ghim · 1/2')).toBeOnTheScreen();
    expect(screen.getByText('Nguyễn An: Họp 9h sáng mai phòng B2')).toBeOnTheScreen();
    expect(screen.getByText('2 ghim')).toBeOnTheScreen();
    expect(screen.queryByText(/Deadline/)).not.toBeOnTheScreen();
  });

  it('chỉ MỘT tin ghim ⇒ không có bộ đếm "1/N"', async () => {
    mockedListPins.mockResolvedValue([NEWEST]);
    const screen = await renderBar();

    expect(await screen.findByText('Tin nhắn ghim')).toBeOnTheScreen();
    expect(screen.getByText('1 ghim')).toBeOnTheScreen();
  });

  it('chạm thanh: nhảy tới tin đang hiện rồi xoay sang tin ghim kế; chạm tiếp thì vòng về đầu', async () => {
    mockedListPins.mockResolvedValue([NEWEST, OLDER]);
    const screen = await renderBar();
    const user = userEvent.setup();

    await user.press(await screen.findByLabelText(/Tin nhắn ghim · 1\/2/));
    expect(screen.onJump).toHaveBeenLastCalledWith('msg-1');
    expect(await screen.findByText('Tin nhắn ghim · 2/2')).toBeOnTheScreen();
    expect(screen.getByText('Trần Bình: Deadline nộp báo cáo thứ Sáu')).toBeOnTheScreen();

    await user.press(screen.getByLabelText(/Tin nhắn ghim · 2\/2/));
    expect(screen.onJump).toHaveBeenLastCalledWith('msg-2');
    expect(await screen.findByText('Tin nhắn ghim · 1/2')).toBeOnTheScreen();
  });

  it('chạm "N ghim" mở danh sách, KHÔNG nhảy tới tin', async () => {
    mockedListPins.mockResolvedValue([NEWEST, OLDER]);
    const screen = await renderBar();
    const user = userEvent.setup();

    await user.press(await screen.findByLabelText('2 tin nhắn đã ghim, xem danh sách'));

    expect(screen.onOpenList).toHaveBeenCalledTimes(1);
    expect(screen.onJump).not.toHaveBeenCalled();
  });

  it('tin của CHÍNH mình hiện "Bạn"; marker nhắc tên hiện `@Tên`, không lộ id thô', async () => {
    mockedListPins.mockResolvedValue([
      makeMessage({
        id: 'msg-3',
        authorId: 'u-me',
        content: 'Nhờ @{u:0123456789abcdef01234567} duyệt giúp',
        mentions: [{ type: 'USER', targetId: '0123456789abcdef01234567', label: 'Lê Cường' }],
        pinnedAt: '2026-09-27T10:00:00.000Z',
      }),
    ]);
    const screen = await renderBar();

    expect(await screen.findByText('Bạn: Nhờ @Lê Cường duyệt giúp')).toBeOnTheScreen();
    expect(screen.queryByText(/@\{u:/)).not.toBeOnTheScreen();
  });

  it('bỏ qua tin ghim đã thu hồi; thu hồi hết thì không vẽ gì', async () => {
    mockedListPins.mockResolvedValue([makeMessage({ id: 'msg-4', deleted: true, pinnedAt: '2026-09-27T10:00:00.000Z' }), OLDER]);
    const screen = await renderBar();

    expect(await screen.findByText('Tin nhắn ghim')).toBeOnTheScreen();
    expect(screen.getByText('1 ghim')).toBeOnTheScreen();
  });

  it('tác giả không tra được ⇒ "Thành viên" (không để trống trước dấu hai chấm)', async () => {
    mockedListPins.mockResolvedValue([makeMessage({ id: 'msg-5', authorId: 'u-la', content: 'Ghi chú', pinnedAt: '2026-09-27T10:00:00.000Z' })]);
    const screen = await renderBar();

    expect(await screen.findByText('Thành viên: Ghi chú')).toBeOnTheScreen();
  });
});
