import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { io } from 'socket.io-client';

import { SocketEvent } from '@/core/socket';

import { discoveryService } from '../api/discovery.service';
import { PinnedListScreen } from '../screens/PinnedListScreen';
import { apiError, makePinned, renderWithProviders } from './fixtures';

/**
 * Danh sách ghim (README p1-09 §8 DU-04): tiêu đề `n/max`, tên người gửi/người ghim, mở tin, gỡ ghim CHỈ khi
 * `myPermissions.canPin`, realtime `pin:updated`, mất quyền → rời màn.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@shopify/flash-list', () => ({ FlashList: jest.requireActual('react-native').FlatList }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/discovery.service', () => ({
  discoveryService: { listPins: jest.fn(), listMembers: jest.fn(), unpin: jest.fn() },
}));

interface MockSocket {
  __emitServer: (event: string, payload?: unknown) => void;
}
const mockSocket = (io as jest.MockedFunction<typeof io>).mock.results[0]?.value as MockSocket;

const mockedPins = jest.mocked(discoveryService.listPins);
const mockedMembers = jest.mocked(discoveryService.listMembers);
const mockedUnpin = jest.mocked(discoveryService.unpin);

const CHANNEL = { scopeType: 'CHANNEL', scopeId: 'ch-1', workspaceId: 'ws-1' } as const;

function pinsPage(items = [makePinned()], total = items.length, max = 20) {
  return {
    data: items,
    meta: { nextCursor: null, hasMore: false, limit: 30, total, max },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedPins.mockReset().mockResolvedValue(pinsPage());
  mockedMembers.mockReset().mockResolvedValue([{ userId: 'u-an', name: 'Nguyễn Văn An', avatarUrl: null }]);
  mockedUnpin.mockReset().mockResolvedValue(undefined);
});

describe('PinnedListScreen', () => {
  it('tiêu đề "Tin đã ghim (n/max)"; dòng có tên người gửi (tra danh bạ) và "Ghim bởi …"', async () => {
    mockedPins.mockResolvedValue(pinsPage([makePinned(), makePinned({ id: 'p-2', content: 'Quy định nộp bài' })], 2, 20));
    await renderWithProviders(<PinnedListScreen scope={CHANNEL} />);

    expect(await screen.findByText('Tin đã ghim (2/20)')).toBeOnTheScreen();
    expect(screen.getByText('Lịch bảo vệ đồ án')).toBeOnTheScreen();
    expect((await screen.findAllByText('Nguyễn Văn An')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Ghim bởi Trần Thị Bình/).length).toBe(2);
  });

  it('hội thoại max = 10 (trần ghim hội thoại)', async () => {
    mockedPins.mockResolvedValue(pinsPage([makePinned()], 1, 10));
    await renderWithProviders(<PinnedListScreen scope={{ scopeType: 'CONVERSATION', scopeId: 'cv-1' }} />);

    expect(await screen.findByText('Tin đã ghim (1/10)')).toBeOnTheScreen();
  });

  it('mention trong nội dung hiện @Tên, KHÔNG in marker/id thô', async () => {
    mockedPins.mockResolvedValue(
      pinsPage([
        makePinned({
          content: 'Nhờ @{u:64f000000000000000000002} chốt lịch',
          mentions: [{ type: 'USER', targetId: '64f000000000000000000002', label: 'Bình' }],
        }),
      ]),
    );
    await renderWithProviders(<PinnedListScreen scope={CHANNEL} />);

    expect(await screen.findByText('Nhờ @Bình chốt lịch')).toBeOnTheScreen();
    expect(screen.queryByText(/@\{u:/)).toBeNull();
  });

  it('rỗng: "Chưa có tin nào được ghim"', async () => {
    mockedPins.mockResolvedValue(pinsPage([], 0));
    await renderWithProviders(<PinnedListScreen scope={CHANNEL} />);

    expect(await screen.findByText('Chưa có tin nào được ghim')).toBeOnTheScreen();
  });

  it('chạm dòng → mở tin bằng `?m=` (route kênh)', async () => {
    await renderWithProviders(<PinnedListScreen scope={CHANNEL} />);

    await fireEvent.press(await screen.findByText('Lịch bảo vệ đồ án'));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/workspaces/[wsId]/channels/[chId]',
      params: { wsId: 'ws-1', chId: 'ch-1', m: 'p-1' },
    });
  });

  it('nút "Bỏ ghim" CHỈ ở tin có myPermissions.canPin; bấm → DELETE, dòng biến mất ngay, toast', async () => {
    const noPerm = makePinned({
      id: 'p-2',
      content: 'Tin không có quyền bỏ ghim',
      myPermissions: { ...makePinned().myPermissions, canPin: false },
    });
    mockedPins.mockResolvedValueOnce(pinsPage([makePinned(), noPerm], 2));
    mockedPins.mockResolvedValue(pinsPage([noPerm], 1));
    await renderWithProviders(<PinnedListScreen scope={CHANNEL} />);

    await screen.findByText('Lịch bảo vệ đồ án');
    expect(screen.getAllByText('Bỏ ghim')).toHaveLength(1);

    await fireEvent.press(screen.getByText('Bỏ ghim'));

    expect(mockedUnpin).toHaveBeenCalledWith('p-1');
    await waitFor(() => expect(screen.queryByText('Lịch bảo vệ đồ án')).toBeNull());
    expect(screen.getByText('Tin không có quyền bỏ ghim')).toBeOnTheScreen();
  });

  it('gỡ ghim lỗi → dòng được KHÔI PHỤC (rollback)', async () => {
    mockedUnpin.mockRejectedValue(apiError(403, 'PERM_006'));
    await renderWithProviders(<PinnedListScreen scope={CHANNEL} />);

    await screen.findByText('Lịch bảo vệ đồ án');
    await fireEvent.press(screen.getByText('Bỏ ghim'));

    await waitFor(() => expect(mockedUnpin).toHaveBeenCalled());
    expect(await screen.findByText('Lịch bảo vệ đồ án')).toBeOnTheScreen();
  });

  it('realtime pin:updated ĐÚNG phạm vi → tải lại danh sách; phạm vi khác thì bỏ qua', async () => {
    await renderWithProviders(<PinnedListScreen scope={CHANNEL} />);
    await screen.findByText('Lịch bảo vệ đồ án');
    expect(mockedPins).toHaveBeenCalledTimes(1);

    await act(async () =>
      mockSocket.__emitServer(SocketEvent.PIN_UPDATED, { messageId: 'x', scopeType: 'CHANNEL', scopeId: 'ch-khac', pinned: true }),
    );
    expect(mockedPins).toHaveBeenCalledTimes(1);

    mockedPins.mockResolvedValue(pinsPage([makePinned(), makePinned({ id: 'p-9', content: 'Vừa được ghim' })], 2));
    await act(async () =>
      mockSocket.__emitServer(SocketEvent.PIN_UPDATED, { messageId: 'p-9', scopeType: 'CHANNEL', scopeId: 'ch-1', pinned: true }),
    );

    expect(await screen.findByText('Vừa được ghim')).toBeOnTheScreen();
    expect(screen.getByText('Tin đã ghim (2/20)')).toBeOnTheScreen();
  });

  it('mất quyền (404) → toast trung tính + rời màn', async () => {
    mockedPins.mockRejectedValue(apiError(404, 'PERM_404'));
    await renderWithProviders(<PinnedListScreen scope={CHANNEL} />);

    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });
});
