import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { showToast } from '@/shared/utils/toast.utils';

import { guestsService, membersService, type MemberCard } from '../api';
import { GuestManageForm } from '../components/GuestManageForm';

/**
 * Quản lý một KHÁCH (app.md p3-04 §3 `ManageGuest`, §8): sửa kênh chỉ định gửi đúng
 * `updateGuestSchema` (`expectedVersion` = `membership.version`), 409 tải lại, "Thu hồi quyền
 * khách ngay" qua `remove` có sẵn của p1-02 kèm hậu quả nêu rõ. Chọn NGÀY ở DatePicker là
 * việc của bộ chung (đã có test riêng) — ở đây không lặp lại.
 */

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return {
    ...actual,
    guestsService: { ...actual.guestsService, listChannelOptions: jest.fn(), update: jest.fn() },
    membersService: { ...actual.membersService, remove: jest.fn() },
  };
});

const mockedUpdate = jest.mocked(guestsService.update);
const mockedChannels = jest.mocked(guestsService.listChannelOptions);
const mockedRemove = jest.mocked(membersService.remove);

const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

const CARD: MemberCard = {
  userId: 'u-g',
  name: 'Khách A',
  displayName: null,
  avatarUrl: null,
  role: 'GUEST',
  status: 'ACTIVE',
  joinedAt: '2026-09-01T00:00:00.000Z',
  presence: 'OFFLINE',
  isMe: false,
  expiresAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
  version: 7,
  guestChannelIds: ['c1'],
  actions: { canMessage: false, canCall: false, canChangeRole: false, canRemove: true, canBan: false },
};

function apiError(status: number, code: string) {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { status, data: { error: { code, message: code } }, headers: {} },
  });
}

async function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    );
  }
  await render(<GuestManageForm card={CARD} wsId="ws-1" />, { wrapper: Wrapper });
  await screen.findByLabelText('chung');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedChannels.mockResolvedValue([
    { id: 'c1', name: 'chung', visibility: 'PUBLIC' },
    { id: 'c2', name: 'giao-vien', visibility: 'PRIVATE' },
  ]);
});

describe('GuestManageForm', () => {
  it('kênh đang chỉ định được tích sẵn; chưa đổi gì → Lưu không gọi API', async () => {
    await renderForm();

    await fireEvent.press(screen.getByText('Lưu thay đổi'));

    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('thêm kênh → gửi CHỈ channelIds + expectedVersion (không gửi expiresAt khi hạn chưa đổi)', async () => {
    mockedUpdate.mockResolvedValue({} as never);
    await renderForm();

    await fireEvent.press(screen.getByLabelText('giao-vien, kênh riêng tư'));
    await fireEvent.press(screen.getByText('Lưu thay đổi'));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('ws-1', 'u-g', { expectedVersion: 7, channelIds: ['c1', 'c2'] }),
    );
    expect(showToast).toHaveBeenCalledWith('success', 'Đã cập nhật quyền khách.');
  });

  it('bỏ hết kênh → khoá Lưu (khách phải còn ≥ 1 kênh)', async () => {
    await renderForm();

    await fireEvent.press(screen.getByLabelText('chung'));
    await fireEvent.press(screen.getByText('Lưu thay đổi'));

    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('409 (version lệch) → nói đã tải lại, không hiện như lỗi cứng', async () => {
    mockedUpdate.mockRejectedValue(apiError(409, 'RES_003'));
    await renderForm();
    await fireEvent.press(screen.getByLabelText('giao-vien, kênh riêng tư'));

    await fireEvent.press(screen.getByText('Lưu thay đổi'));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        'info',
        'Thông tin khách vừa thay đổi — đã tải lại, hãy kiểm tra rồi lưu lại.',
      ),
    );
  });

  it('CH_013 → lỗi ngay dưới danh sách kênh', async () => {
    mockedUpdate.mockRejectedValue(apiError(403, 'CH_013'));
    await renderForm();
    await fireEvent.press(screen.getByLabelText('giao-vien, kênh riêng tư'));

    await fireEvent.press(screen.getByText('Lưu thay đổi'));

    expect(await screen.findByText(/Bạn chỉ chỉ định được kênh riêng tư mà mình quản lý/)).toBeOnTheScreen();
  });

  it('Thu hồi quyền khách ngay → nêu hậu quả, xác nhận mới gọi remove (lý do mặc định ≥ 10 ký tự), rồi quay lại', async () => {
    mockedRemove.mockResolvedValue(undefined);
    await renderForm();

    await fireEvent.press(screen.getByText('Thu hồi quyền khách ngay'));

    expect(await screen.findByText('Thu hồi quyền khách của Khách A?')).toBeOnTheScreen();
    expect(screen.getByText(/mất quyền vào mọi kênh được chỉ định ngay lập tức/)).toBeOnTheScreen();
    // ⛔ Mở sheet CHƯA được thu hồi.
    expect(mockedRemove).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Thu hồi quyền khách'));

    await waitFor(() => expect(mockedRemove).toHaveBeenCalledWith('ws-1', 'u-g', { reason: 'Thu hồi quyền khách' }));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(showToast).toHaveBeenCalledWith('success', 'Đã thu hồi quyền khách của Khách A.');
  });

  it('lý do < 10 ký tự → khoá nút thu hồi', async () => {
    await renderForm();
    await fireEvent.press(screen.getByText('Thu hồi quyền khách ngay'));
    await fireEvent.changeText(await screen.findByLabelText('Lý do'), 'ngắn');

    await fireEvent.press(screen.getByText('Thu hồi quyền khách'));

    expect(mockedRemove).not.toHaveBeenCalled();
  });
});
