import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { apiClient } from '@/core/api/client';
import { useBlockedUsersStore } from '@/shared/stores/blocked-users.store';

import { BlockedUsersScreen } from '../screens/BlockedUsersScreen';
import { apiError, envelope, renderWithProviders } from './test-utils';

/**
 * `me/blocked` (p1-08 #8): danh sách + Bỏ chặn LUÔN qua hộp xác nhận, bỏ chặn lạc quan cập nhật cả tập
 * `useBlockedIds` lẫn danh sách, và hỏng thì trả lại (không lừa người dùng rằng đã bỏ chặn).
 */

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@/core/api/client', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), delete: jest.fn() } }));
jest.mock('@shopify/flash-list', () => ({ FlashList: jest.requireActual('react-native').FlatList }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const get = jest.mocked(apiClient.get);
const del = jest.mocked(apiClient.delete);

const BLOCKED = [
  { userId: 'u-1', name: 'An', avatarUrl: null, blockedAt: '2026-09-19T03:00:00.000Z' },
  { userId: 'u-2', name: 'Bình', avatarUrl: null, blockedAt: '2026-09-10T03:00:00.000Z' },
];

function listResponse(users = BLOCKED) {
  return envelope(users, { nextCursor: null, hasMore: false, limit: 50, allIds: users.map((u) => u.userId) });
}

describe('BlockedUsersScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useBlockedUsersStore.getState().reset();
    useBlockedUsersStore.getState().hydrate(['u-1', 'u-2']);
  });

  it('hiện tên + ngày chặn (dd/MM/yyyy) của từng người', async () => {
    get.mockResolvedValue(listResponse());
    await renderWithProviders(<BlockedUsersScreen />);

    expect(await screen.findByText('An')).toBeOnTheScreen();
    expect(screen.getByText('Bình')).toBeOnTheScreen();
    expect(screen.getByText('Đã chặn 19/09/2026')).toBeOnTheScreen();
    expect(screen.getByText('Đã chặn 10/09/2026')).toBeOnTheScreen();
  });

  it('bấm Bỏ chặn CHỈ mở hộp xác nhận (chưa gọi API); xác nhận ⇒ DELETE /me/blocks/:id, dòng biến mất, tập chặn mất id', async () => {
    // Lần tải đầu đủ hai người; sau khi DELETE thành công server trả danh sách đã bỏ An (làm mới sau `onSettled`).
    get.mockResolvedValueOnce(listResponse()).mockResolvedValue(listResponse([BLOCKED[1] as (typeof BLOCKED)[number]]));
    del.mockResolvedValue(envelope(null));
    await renderWithProviders(<BlockedUsersScreen />);
    await screen.findByText('An');

    await fireEvent.press(screen.getByLabelText('Bỏ chặn An'));
    expect(await screen.findByText('Bỏ chặn An?')).toBeOnTheScreen();
    expect(del).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Bỏ chặn' }));

    await waitFor(() => expect(del).toHaveBeenCalledWith('/me/blocks/u-1', { skipErrorToast: true }));
    await waitFor(() => expect(screen.queryByLabelText('Bỏ chặn An')).toBeNull());
    expect(screen.getByLabelText('Bỏ chặn Bình')).toBeOnTheScreen();
    expect(useBlockedUsersStore.getState().ids.has('u-1')).toBe(false);
    expect(useBlockedUsersStore.getState().ids.has('u-2')).toBe(true);
  });

  it('Huỷ hộp xác nhận ⇒ không gọi API, vẫn còn trong danh sách chặn', async () => {
    get.mockResolvedValue(listResponse());
    await renderWithProviders(<BlockedUsersScreen />);
    await screen.findByText('An');

    await fireEvent.press(screen.getByLabelText('Bỏ chặn An'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Huỷ' }));

    expect(del).not.toHaveBeenCalled();
    expect(useBlockedUsersStore.getState().ids.has('u-1')).toBe(true);
  });

  it('bỏ chặn THẤT BẠI ⇒ trả lại cả tập lẫn dòng, báo lỗi trong hộp xác nhận', async () => {
    get.mockResolvedValue(listResponse());
    del.mockRejectedValue(apiError(404, 'PERM_404'));
    await renderWithProviders(<BlockedUsersScreen />);
    await screen.findByText('An');

    await fireEvent.press(screen.getByLabelText('Bỏ chặn An'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Bỏ chặn' }));

    await waitFor(() => expect(del).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Không tìm thấy người dùng này.')).toBeOnTheScreen();
    expect(useBlockedUsersStore.getState().ids.has('u-1')).toBe(true);
    expect(screen.getByLabelText('Bỏ chặn An')).toBeOnTheScreen();
  });

  it('chưa chặn ai ⇒ "Bạn chưa chặn ai"', async () => {
    get.mockResolvedValue(listResponse([]));
    await renderWithProviders(<BlockedUsersScreen />);
    expect(await screen.findByText('Bạn chưa chặn ai')).toBeOnTheScreen();
  });

  it('tải lỗi ⇒ "Không tải được" + Thử lại gọi lại API', async () => {
    get.mockRejectedValueOnce(apiError(500, 'SRV_001')).mockResolvedValueOnce(listResponse());
    await renderWithProviders(<BlockedUsersScreen />);

    expect(await screen.findByText('Không tải được')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Thử lại'));
    expect(await screen.findByText('An')).toBeOnTheScreen();
  });
});
