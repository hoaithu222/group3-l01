import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { showToast } from '@/shared/utils/toast.utils';

import { joinRequestsService } from '../api';
import { JoinRequestsScreen } from '../screens/JoinRequestsScreen';
import { apiError, renderWithProviders } from './test-utils';

/**
 * `JoinRequestsScreen` (app.md p3-04 §3, §8): Duyệt/Từ chối gỡ dòng LẠC QUAN; 409 (người
 * khác đã xử lý) giữ việc gỡ + toast "đã được xử lý" (không phải lỗi); lỗi khác hoàn lại dòng.
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ wsId: 'ws-1' }),
}));
jest.mock('@/core/socket', () => ({ useConnectionState: () => 'online' }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return { ...actual, joinRequestsService: { ...actual.joinRequestsService, decide: jest.fn(), list: jest.fn() } };
});

const mockedDecide = jest.mocked(joinRequestsService.decide);
const mockedList = jest.mocked(joinRequestsService.list);

const REQUEST = {
  user: { id: 'u5', name: 'Nga', avatarUrl: null },
  requestMessage: 'Em là học sinh lớp 12A',
  requestedAt: new Date().toISOString(),
  via: 'INVITE_LINK' as const,
};
const PAGE_WITH = { items: [REQUEST], meta: { nextCursor: null, hasMore: false, limit: 20 } };
const PAGE_EMPTY = { items: [], meta: { nextCursor: null, hasMore: false, limit: 20 } };

/** Sau khi xử lý, BE không còn trả yêu cầu đó — mô phỏng để lượt tải lại (invalidate) không "hồi sinh" dòng. */
function serverDropsRequest(): void {
  mockedList.mockResolvedValue(PAGE_EMPTY);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedList.mockResolvedValue(PAGE_WITH);
});

describe('JoinRequestsScreen', () => {
  it('hiện lời nhắn; Duyệt → gọi approve và gỡ dòng ngay', async () => {
    mockedDecide.mockImplementation(async () => {
      serverDropsRequest();
      return {} as never;
    });
    await renderWithProviders(<JoinRequestsScreen />);
    expect(await screen.findByText('Em là học sinh lớp 12A')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Duyệt'));

    await waitFor(() => expect(mockedDecide).toHaveBeenCalledWith('ws-1', 'u5', 'approve', undefined));
    await waitFor(() => expect(screen.queryByText('Em là học sinh lớp 12A')).toBeNull());
    expect(showToast).toHaveBeenCalledWith('success', 'Đã duyệt Nga.');
  });

  it('409 (người khác đã xử lý) → toast "đã được xử lý" và dòng vẫn bị gỡ (không hoàn lại)', async () => {
    mockedDecide.mockImplementation(async () => {
      serverDropsRequest();
      throw apiError(409, 'RES_003');
    });
    await renderWithProviders(<JoinRequestsScreen />);
    await fireEvent.press(await screen.findByText('Duyệt'));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('info', 'Yêu cầu này đã được xử lý.'));
    await waitFor(() => expect(screen.queryByText('Em là học sinh lớp 12A')).toBeNull());
  });

  it('lỗi khác (mất mạng…) → toast lỗi và HOÀN LẠI dòng để bấm lại', async () => {
    mockedDecide.mockRejectedValue(apiError(500, 'SYS_001'));
    await renderWithProviders(<JoinRequestsScreen />);
    await fireEvent.press(await screen.findByText('Duyệt'));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('error', expect.any(String)));
    expect(await screen.findByText('Em là học sinh lớp 12A')).toBeOnTheScreen();
  });

  it('Từ chối mở sheet lý do (tuỳ chọn); xác nhận gửi reason', async () => {
    mockedDecide.mockResolvedValue({} as never);
    await renderWithProviders(<JoinRequestsScreen />);
    await fireEvent.press(await screen.findByText('Từ chối'));

    expect(await screen.findByText('Từ chối Nga?')).toBeOnTheScreen();
    // ⛔ Mở sheet CHƯA được từ chối.
    expect(mockedDecide).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Lý do (tuỳ chọn)'), 'Chưa đủ điều kiện');
    // Hai nút "Từ chối": ở dòng yêu cầu và ở chân sheet — nút cuối là của sheet.
    const buttons = screen.getAllByText('Từ chối');
    await fireEvent.press(buttons[buttons.length - 1]!);

    await waitFor(() => expect(mockedDecide).toHaveBeenCalledWith('ws-1', 'u5', 'reject', 'Chưa đủ điều kiện'));
  });
});
