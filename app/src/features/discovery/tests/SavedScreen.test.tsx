import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useSavedMessagesStore } from '@/shared/saved';

import { discoveryService } from '../api/discovery.service';
import type { SavedItem } from '../api/discovery.types';
import { SavedScreen } from '../screens/SavedScreen';
import { makeSavedItem, makeUnavailable, renderWithProviders } from './fixtures';

/**
 * "Đã lưu" — hiển thị (README p1-09 §8 DU-03/SAV-01): thẻ MỜ cho mục không khả dụng (không lộ nội dung), trạng thái rỗng,
 * nạp cờ "đã lưu". Thao tác (mở tin, bỏ lưu, lọc, phân trang, realtime): `SavedScreen.actions.test.tsx`.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@shopify/flash-list', () => ({ FlashList: jest.requireActual('react-native').FlatList }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/discovery.service', () => ({
  discoveryService: { listSaved: jest.fn(), listWorkspaces: jest.fn() },
}));

const mockedList = jest.mocked(discoveryService.listSaved);
const mockedWorkspaces = jest.mocked(discoveryService.listWorkspaces);

const page = (data: SavedItem[] = [makeSavedItem()], meta: Partial<{ nextCursor: string | null; hasMore: boolean }> = {}) => ({
  data,
  meta: { nextCursor: null, hasMore: false, limit: 30, ...meta },
});

beforeEach(() => {
  jest.clearAllMocks();
  useSavedMessagesStore.getState().clear();
  mockedList.mockReset().mockResolvedValue(page());
  mockedWorkspaces.mockReset().mockResolvedValue([{ id: 'ws-1', name: 'Nhóm Đồ án' }]);
});

describe('SavedScreen — hiển thị', () => {
  it('mục khả dụng: người gửi · phạm vi (#kênh) · trích đoạn', async () => {
    await renderWithProviders(<SavedScreen />);

    expect(await screen.findByText('Nộp báo cáo trước thứ Sáu')).toBeOnTheScreen();
    expect(screen.getByText('Nguyễn Văn An')).toBeOnTheScreen();
    expect(screen.getByText('#chung')).toBeOnTheScreen();
  });

  it('kênh riêng tư ghi rõ; hội thoại nhóm ghi "Nhóm chat: …"', async () => {
    mockedList.mockResolvedValue(
      page([
        makeSavedItem({ messageId: 'm-1', scope: { type: 'CHANNEL', id: 'ch-2', name: 'ban-chu-nhiem', isPrivate: true } }),
        makeSavedItem({
          messageId: 'm-2',
          scopeType: 'CONVERSATION',
          workspaceId: null,
          scope: { type: 'CONVERSATION', id: 'cv-1', name: 'Nhóm học', kind: 'GROUP', isPrivate: true },
        }),
      ]),
    );
    await renderWithProviders(<SavedScreen />);

    expect(await screen.findByText('#ban-chu-nhiem · Riêng tư')).toBeOnTheScreen();
    expect(screen.getByText('Nhóm chat: Nhóm học')).toBeOnTheScreen();
  });

  it('DU-03: mục không khả dụng là thẻ mờ "Tin nhắn không còn khả dụng", CHỈ có "Bỏ lưu", chạm không mở tin', async () => {
    mockedList.mockResolvedValue(page([makeUnavailable('msg-gone')]));
    await renderWithProviders(<SavedScreen />);

    const card = await screen.findByText('Tin nhắn không còn khả dụng');
    expect(screen.getByText('Bỏ lưu')).toBeOnTheScreen();
    // Không có nội dung/tên phạm vi/người gửi nào để lộ.
    expect(screen.queryByText('Nguyễn Văn An')).toBeNull();
    expect(screen.queryByText('#chung')).toBeNull();

    await fireEvent.press(card);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('rỗng: "Chưa có tin nào được lưu" + gợi ý nhấn giữ một tin', async () => {
    mockedList.mockResolvedValue(page([]));
    await renderWithProviders(<SavedScreen />);

    expect(await screen.findByText('Chưa có tin nào được lưu')).toBeOnTheScreen();
    expect(screen.getByText('Nhấn giữ một tin và chọn Lưu.')).toBeOnTheScreen();
  });

  it('nạp id các mục vào tập cờ "đã lưu" (để menu tin hiện "Bỏ lưu")', async () => {
    mockedList.mockResolvedValue(page([makeSavedItem({ messageId: 'm-1' }), makeUnavailable('msg-gone')]));
    await renderWithProviders(<SavedScreen />);
    await screen.findByText('Nộp báo cáo trước thứ Sáu');

    expect(useSavedMessagesStore.getState().ids).toEqual({ 'm-1': true, 'msg-gone': true });
  });
});
