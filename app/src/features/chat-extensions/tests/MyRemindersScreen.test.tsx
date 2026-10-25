import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useConnectionState } from '@/core/socket';
import { showToast } from '@/shared/utils/toast.utils';

import { reminderService } from '../api/reminder.service';
import { MyRemindersScreen } from '../screens/MyRemindersScreen';
import { cursorPage, flushQuery, makeReminder, renderWithProviders } from './fixtures';

/**
 * "Nhắc lại của tôi" (app.md §8): `unavailable` → KHÔNG trích nội dung; chạm dòng mở tin (hội thoại: có sẵn scopeId; kênh: tra nhóm trước); xoá lời nhắc đang chờ; ngoại tuyến ẩn hành động ghi.
 */
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@shopify/flash-list', () => ({ FlashList: jest.requireActual('react-native').FlatList }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/core/socket', () => ({ ...jest.requireActual('@/core/socket'), useConnectionState: jest.fn() }));
jest.mock('../api/reminder.service', () => ({
  reminderService: { cancel: jest.fn(), channelWorkspaceId: jest.fn(), listMine: jest.fn() },
}));

const service = jest.mocked(reminderService);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useConnectionState).mockReturnValue('connected');
  service.listMine.mockResolvedValue(cursorPage([makeReminder()]));
});

describe('MyRemindersScreen', () => {
  it('Sắp tới: trích tin + giờ nhắc theo giờ máy; gọi status=PENDING', async () => {
    await renderWithProviders(<MyRemindersScreen />);

    expect(await screen.findByText('Họp lúc 9h')).toBeOnTheScreen();
    expect(screen.getByText(/^Nhắc lúc \d{2}:\d{2} /)).toBeOnTheScreen();
    expect(service.listMine).toHaveBeenCalledWith({ cursor: undefined, limit: 30, status: 'PENDING' });
    await flushQuery();
  });

  it('`unavailable` (tin đã gỡ/mất quyền) → "Tin không còn khả dụng" và KHÔNG trích nội dung dù BE lỡ trả preview', async () => {
    service.listMine.mockResolvedValue(cursorPage([makeReminder({ preview: 'Nội dung không được lộ', unavailable: true })]));
    await renderWithProviders(<MyRemindersScreen />);

    expect(await screen.findByText('Tin không còn khả dụng')).toBeOnTheScreen();
    expect(screen.queryByText('Nội dung không được lộ')).toBeNull();
    await fireEvent.press(screen.getByText('Tin không còn khả dụng'));
    expect(showToast).toHaveBeenCalledWith('info', 'Tin không còn khả dụng');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('chạm lời nhắc ở HỘI THOẠI → mở đúng tin (?m=)', async () => {
    service.listMine.mockResolvedValue(cursorPage([makeReminder({ scopeId: 'cv-1', scopeType: 'CONVERSATION' })]));
    await renderWithProviders(<MyRemindersScreen />);

    await fireEvent.press(await screen.findByText('Họp lúc 9h'));

    expect(router.push).toHaveBeenCalledWith({ params: { conversationId: 'cv-1', m: 'm-1' }, pathname: '/messages/[conversationId]' });
  });

  it('chạm lời nhắc ở KÊNH → tra nhóm của kênh rồi mở; không tra được → toast, không điều hướng', async () => {
    service.channelWorkspaceId.mockResolvedValueOnce('ws-7').mockResolvedValueOnce(null);
    await renderWithProviders(<MyRemindersScreen />);
    const row = await screen.findByText('Họp lúc 9h');

    await fireEvent.press(row);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ params: { chId: 'ch-1', m: 'm-1', wsId: 'ws-7' }, pathname: '/workspaces/[wsId]/channels/[chId]' }));

    await fireEvent.press(row);
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('info', 'Tin không còn khả dụng'));
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('xoá lời nhắc đang chờ qua menu "⋯" → DELETE + toast; tab Đã nhắc KHÔNG có menu xoá', async () => {
    service.cancel.mockResolvedValue(undefined);
    await renderWithProviders(<MyRemindersScreen />);
    await screen.findByText('Họp lúc 9h');

    await fireEvent.press(screen.getByLabelText('Tuỳ chọn cho lời nhắc'));
    await fireEvent.press(await screen.findByText('Xoá lời nhắc'));

    await waitFor(() => expect(service.cancel).toHaveBeenCalledWith('r-1'));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('success', 'Đã xoá lời nhắc'));

    service.listMine.mockResolvedValue(cursorPage([makeReminder({ id: 'r-2', status: 'FIRED' })]));
    await fireEvent.press(screen.getByText('Đã nhắc'));
    expect(await screen.findByText(/^Đã nhắc lúc /)).toBeOnTheScreen();
    expect(screen.queryByLabelText('Tuỳ chọn cho lời nhắc')).toBeNull();
    await flushQuery();
  });

  it('rỗng → hướng dẫn cách đặt nhắc', async () => {
    service.listMine.mockResolvedValue(cursorPage([]));
    await renderWithProviders(<MyRemindersScreen />);
    expect(await screen.findByText('Chưa có lời nhắc')).toBeOnTheScreen();
  });

  it('ngoại tuyến → xem được nhưng không có menu xoá', async () => {
    jest.mocked(useConnectionState).mockReturnValue('offline');
    await renderWithProviders(<MyRemindersScreen />);

    expect(await screen.findByText('Họp lúc 9h')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Tuỳ chọn cho lời nhắc')).toBeNull();
  });
});
