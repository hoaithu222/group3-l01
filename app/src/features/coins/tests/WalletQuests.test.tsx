import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { showToast } from '@/shared/utils/toast.utils';

import { coinsService } from '../api/coins.service';
import { WalletScreen } from '../screens/WalletScreen';
import { apiError, quest, renderWithClient, settle, tx, wallet } from './coins.harness';

/**
 * app.md p7-02 §3/§8: nhiệm vụ ngày ở màn Ví — nút nhận KHOÁ khi chưa đạt; nhận xong số dư + thẻ đổi ngay ("Đã nhận"); `COIN_004` (đã nhận ở thiết bị khác) báo bằng câu của
 * feature và tải lại nhiệm vụ. (Số dư, lịch sử, socket: `WalletScreen.test.tsx`.)
 */
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => true,
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/shell/capabilities', () => ({ useFeature: () => true }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const walletSpy = jest.spyOn(coinsService, 'wallet');
const questsSpy = jest.spyOn(coinsService, 'quests');
const txSpy = jest.spyOn(coinsService, 'transactions');
const claimSpy = jest.spyOn(coinsService, 'claimQuest');

const page = (ids: string[], nextCursor: string | null = null) => ({
  data: ids.map((id) => tx(id)),
  meta: { hasMore: nextCursor !== null, limit: 20, nextCursor },
});

beforeEach(() => {
  jest.clearAllMocks();
  walletSpy.mockResolvedValue(wallet());
  questsSpy.mockResolvedValue([quest('q1'), quest('q2', { claimable: true, progress: 3 })]);
  txSpy.mockResolvedValue(page(['t1']));
});

describe('Nhiệm vụ ngày', () => {
  it('nút nhận KHOÁ khi nhiệm vụ chưa đạt, mở khi `claimable`', async () => {
    await renderWithClient(<WalletScreen />);

    const locked = await screen.findByRole('button', { name: 'Chưa hoàn thành' });
    expect(locked).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Nhận 20 xu' })).toBeEnabled();
    await fireEvent.press(locked);
    expect(claimSpy).not.toHaveBeenCalled();
    await settle();
  });

  it('nhận thưởng: gọi đúng nhiệm vụ, số dư đổi ngay và thẻ thành "Đã nhận"', async () => {
    claimSpy.mockResolvedValue({ balance: 1270, delta: 20 });
    await renderWithClient(<WalletScreen />);
    // Sau khi nhận, ví được tải lại từ server (số đúng là 1.270) — mock phản ánh điều đó.
    walletSpy.mockResolvedValue(wallet({ balance: 1270, lifetimeEarned: 2020 }));

    await fireEvent.press(await screen.findByRole('button', { name: 'Nhận 20 xu' }));

    await waitFor(() => expect(claimSpy).toHaveBeenCalledWith('q2'));
    expect(await screen.findByLabelText('Số dư của bạn: 1.270 xu')).toBeOnTheScreen();
    expect(screen.getByLabelText('Đã nhận 20 xu từ nhiệm vụ này')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Nhận 20 xu' })).toBeNull();
    await settle();
  });

  it('COIN_004 (đã nhận ở thiết bị khác): báo bằng câu của feature và tải lại nhiệm vụ', async () => {
    claimSpy.mockRejectedValue(apiError(409, 'COIN_004'));
    await renderWithClient(<WalletScreen />);
    await screen.findByRole('button', { name: 'Nhận 20 xu' });
    questsSpy.mockClear();
    questsSpy.mockResolvedValue([
      quest('q2', { claimedAt: '2026-09-27T01:00:00.000Z', progress: 3 }),
    ]);

    await fireEvent.press(screen.getByRole('button', { name: 'Nhận 20 xu' }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('error', 'Phần thưởng nhiệm vụ này đã được nhận'),
    );
    await waitFor(() => expect(questsSpy).toHaveBeenCalled());
    expect(await screen.findByLabelText('Đã nhận 20 xu từ nhiệm vụ này')).toBeOnTheScreen();
    await settle();
  });
});
