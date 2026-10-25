import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { io } from 'socket.io-client';

import { SocketEvent } from '@/core/socket';
import { savedMessagesService, useSavedMessagesStore, useSavedSync } from '@/shared/saved';

import { discoveryService } from '../api/discovery.service';
import type { SavedItem } from '../api/discovery.types';
import { SavedScreen } from '../screens/SavedScreen';
import { makeSavedItem, makeUnavailable, renderWithProviders } from './fixtures';

/**
 * "Đã lưu" — thao tác (README p1-09 §8 SAV-01/SAV-02): mở tin gốc đúng route, bỏ lưu, lọc, phân trang, đồng bộ
 * `saved:updated`. Phần hiển thị (thẻ mờ, rỗng, nạp cờ): `SavedScreen.test.tsx`.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@shopify/flash-list', () => ({ FlashList: jest.requireActual('react-native').FlatList }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/discovery.service', () => ({
  discoveryService: { listSaved: jest.fn(), listWorkspaces: jest.fn() },
}));

interface MockSocket {
  __emitServer: (event: string, payload?: unknown) => void;
}
const mockSocket = (io as jest.MockedFunction<typeof io>).mock.results[0]?.value as MockSocket;

const mockedList = jest.mocked(discoveryService.listSaved);
const mockedWorkspaces = jest.mocked(discoveryService.listWorkspaces);
const unsaveSpy = jest.spyOn(savedMessagesService, 'unsave');

const page = (data: SavedItem[] = [makeSavedItem()], meta: Partial<{ nextCursor: string | null; hasMore: boolean }> = {}) => ({
  data,
  meta: { nextCursor: null, hasMore: false, limit: 30, ...meta },
});

beforeEach(() => {
  jest.clearAllMocks();
  useSavedMessagesStore.getState().clear();
  mockedList.mockReset().mockResolvedValue(page());
  mockedWorkspaces.mockReset().mockResolvedValue([{ id: 'ws-1', name: 'Nhóm Đồ án' }]);
  unsaveSpy.mockReset().mockResolvedValue(undefined);
});

describe('SavedScreen — thao tác', () => {
  it('chạm mục KÊNH → route kênh + m (around)', async () => {
    await renderWithProviders(<SavedScreen />);

    await fireEvent.press(await screen.findByText('Nộp báo cáo trước thứ Sáu'));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/workspaces/[wsId]/channels/[chId]',
      params: { wsId: 'ws-1', chId: 'ch-1', m: 'm-1' },
    });
  });

  it('chạm mục là reply trong luồng → màn luồng của tin gốc; mục hội thoại → route hội thoại', async () => {
    mockedList.mockResolvedValue(
      page([
        makeSavedItem({
          messageId: 'msg-reply',
          message: { ...makeSavedItem().message, id: 'msg-reply', excerpt: 'Trả lời trong luồng', threadId: 'root-1' },
        }),
        makeSavedItem({
          messageId: 'msg-dm',
          scopeType: 'CONVERSATION',
          scopeId: 'cv-1',
          workspaceId: null,
          message: { ...makeSavedItem().message, id: 'msg-dm', excerpt: 'Tin nhắn riêng' },
          scope: { type: 'CONVERSATION', id: 'cv-1', name: 'Bình', kind: 'DIRECT', isPrivate: true },
        }),
      ]),
    );
    await renderWithProviders(<SavedScreen />);

    await fireEvent.press(await screen.findByText('Trả lời trong luồng'));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/workspaces/[wsId]/channels/[chId]/thread/[messageId]',
      params: { wsId: 'ws-1', chId: 'ch-1', messageId: 'root-1', m: 'msg-reply' },
    });

    await fireEvent.press(screen.getByText('Tin nhắn riêng'));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/messages/[conversationId]',
      params: { conversationId: 'cv-1', m: 'msg-dm' },
    });
  });

  it('"Bỏ lưu": gọi DELETE, mục biến mất khỏi danh sách, cờ "đã lưu" tắt', async () => {
    mockedList.mockResolvedValueOnce(page([makeSavedItem(), makeUnavailable('msg-gone')]));
    mockedList.mockResolvedValue(page([makeSavedItem()]));
    await renderWithProviders(<SavedScreen />);
    await screen.findByText('Tin nhắn không còn khả dụng');

    await fireEvent.press(screen.getByText('Bỏ lưu'));

    expect(unsaveSpy).toHaveBeenCalledWith('msg-gone');
    await waitFor(() => expect(screen.queryByText('Tin nhắn không còn khả dụng')).toBeNull());
    expect(screen.getByText('Nộp báo cáo trước thứ Sáu')).toBeOnTheScreen();
    expect(useSavedMessagesStore.getState().ids['msg-gone']).toBeUndefined();
  });

  it('chip "Kênh" / "Tin nhắn" lọc theo scopeType; chọn nhóm lọc theo workspaceId', async () => {
    await renderWithProviders(<SavedScreen />);
    await screen.findByText('Nộp báo cáo trước thứ Sáu');

    await fireEvent.press(screen.getByText('Kênh'));
    await waitFor(() => expect(mockedList).toHaveBeenLastCalledWith(expect.objectContaining({ scopeType: 'CHANNEL' })));

    await fireEvent.press(screen.getByText('Tất cả nhóm'));
    await fireEvent.press(await screen.findByText('Nhóm Đồ án'));
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith(expect.objectContaining({ scopeType: 'CHANNEL', workspaceId: 'ws-1' })),
    );
    expect(await screen.findByText('Nhóm: Nhóm Đồ án')).toBeOnTheScreen();
  });

  it('phân trang: cuối danh sách → trang kế với cursor', async () => {
    mockedList
      .mockResolvedValueOnce(page([makeSavedItem({ messageId: 'm-1' })], { hasMore: true, nextCursor: 'c-2' }))
      .mockResolvedValueOnce(
        page([
          makeSavedItem({
            messageId: 'm-2',
            message: { ...makeSavedItem().message, id: 'm-2', excerpt: 'Tin ở trang hai' },
          }),
        ]),
      );
    await renderWithProviders(<SavedScreen />);
    await screen.findByText('Nộp báo cáo trước thứ Sáu');

    await fireEvent(screen.getByTestId('saved-list'), 'endReached');

    expect(await screen.findByText('Tin ở trang hai')).toBeOnTheScreen();
    expect(mockedList).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'c-2' }));
  });
});

/** `useSavedSync` mount ở `(app)/_layout` — ở đây dựng cùng màn để kiểm cầu nối socket → cache → danh sách. */
function Harness() {
  useSavedSync();
  return <SavedScreen />;
}

describe('SavedScreen — realtime', () => {
  it('saved:updated (máy khác lưu/bỏ lưu) → làm mới danh sách', async () => {
    await renderWithProviders(<Harness />);
    await screen.findByText('Nộp báo cáo trước thứ Sáu');
    expect(mockedList).toHaveBeenCalledTimes(1);
    mockedList.mockResolvedValue(
      page([
        makeSavedItem(),
        makeSavedItem({
          messageId: 'm-9',
          message: { ...makeSavedItem().message, id: 'm-9', excerpt: 'Vừa lưu ở máy khác' },
        }),
      ]),
    );

    await act(async () =>
      mockSocket.__emitServer(SocketEvent.SAVED_UPDATED, {
        v: 1,
        serverNow: '2026-09-19T00:00:00.000Z',
        messageId: 'm-9',
        saved: true,
      }),
    );

    expect(await screen.findByText('Vừa lưu ở máy khác')).toBeOnTheScreen();
  });
});
