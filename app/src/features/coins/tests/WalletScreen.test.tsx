import { act, fireEvent, screen } from '@testing-library/react-native';

import { SocketEvent } from '@/core/socket';

import { coinsService } from '../api/coins.service';
import { useCoinsEvents } from '../hooks/useCoinsEvents';
import { WalletScreen } from '../screens/WalletScreen';
import {
  mockSocket,
  networkError,
  quest,
  renderWithClient,
  settle,
  tx,
  wallet,
} from './coins.harness';

/**
 * app.md p7-02 §3/§8: màn Ví — số dư + "hôm nay đã nhận X/200", nhiệm vụ (nút nhận KHOÁ khi chưa đạt; nhận xong số dư/nút đổi ngay; COIN_004/005 báo + tải lại),
 * lịch sử cursor có lọc loại, `gamification:updated.coins` đổi số dư ở đầu màn. Câu lỗi/khối rỗng nói bằng chữ.
 */

// Số dư chạy dần (`AnimatedNumber`) đổi state theo khung hình — ngoài `act` của test nên React báo cảnh báo; bật "Giảm chuyển động" để test xác định.
// Hoạt ảnh có test riêng ở `tests/ui/motion.test.tsx`.
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

const page = (ids: string[], nextCursor: string | null = null) => ({
  data: ids.map((id) => tx(id)),
  meta: { hasMore: nextCursor !== null, limit: 20, nextCursor },
});

/** Màn + trình nghe socket của layout `me/coins` (route gắn `useCoinsEvents` một lần ở `_layout.tsx`). */
function WalletWithEvents() {
  useCoinsEvents();
  return <WalletScreen />;
}

beforeEach(() => {
  jest.clearAllMocks();
  walletSpy.mockResolvedValue(wallet());
  questsSpy.mockResolvedValue([quest('q1'), quest('q2', { claimable: true, progress: 3 })]);
  txSpy.mockResolvedValue(page(['t1']));
});

describe('WalletScreen', () => {
  it('số dư kèm chữ "xu", trần ngày, nhiệm vụ và lịch sử; luôn nhắc xu không quy đổi ra tiền', async () => {
    await renderWithClient(<WalletScreen />);

    expect(await screen.findByLabelText('Số dư của bạn: 1.250 xu')).toBeOnTheScreen();
    expect(screen.getByText('Hôm nay đã nhận 40/200 xu từ hoạt động')).toBeOnTheScreen();
    expect(screen.getByText('Nhiệm vụ q1')).toBeOnTheScreen();
    expect(screen.getByText('Hoàn thành công việc đúng hạn')).toBeOnTheScreen();
    expect(
      screen.getByLabelText(/^Hoàn thành công việc đúng hạn, \+20 xu, số dư sau đó 1\.250 xu, /),
    ).toBeOnTheScreen();
    expect(
      screen.getByText('Xu là điểm thưởng trong ứng dụng, không quy đổi ra tiền.'),
    ).toBeOnTheScreen();
    await settle();
  });

  it('`gamification:updated` có coins ⇒ số dư ở đầu màn đổi; dạng XP (không coins) thì bỏ qua', async () => {
    await renderWithClient(<WalletWithEvents />);
    await screen.findByLabelText('Số dư của bạn: 1.250 xu');
    walletSpy.mockResolvedValue(wallet({ balance: 1320, todayEarned: 90 }));

    await act(async () => {
      mockSocket.__emitServer(SocketEvent.GAMIFICATION_UPDATED, {
        level: 4,
        newBadges: [],
        streak: 2,
        xp: 900,
      });
    });
    expect(screen.getByLabelText('Số dư của bạn: 1.250 xu')).toBeOnTheScreen();

    await act(async () => {
      mockSocket.__emitServer(SocketEvent.GAMIFICATION_UPDATED, {
        coins: { balance: 1320, delta: 70, reason: 'EARN_EVENT' },
      });
    });
    expect(await screen.findByLabelText('Số dư của bạn: 1.320 xu')).toBeOnTheScreen();
    // Sự kiện chỉ để đồng bộ nhanh: ví được tải lại từ server (trần ngày "90/200" chỉ server biết).
    expect(await screen.findByText('Hôm nay đã nhận 90/200 xu từ hoạt động')).toBeOnTheScreen();
    await settle();
  });

  it('lọc lịch sử theo loại: mỗi tab một truy vấn với `type` đúng', async () => {
    await renderWithClient(<WalletScreen />);
    await screen.findByText('Hoàn thành công việc đúng hạn');

    txSpy.mockResolvedValue({
      data: [tx('t9', { amount: -300, refId: 'item1', type: 'SPEND_SHOP' })],
      meta: { hasMore: false, limit: 20, nextCursor: null },
    });
    await fireEvent.press(screen.getByRole('tab', { name: 'Cửa hàng' }));

    expect(await screen.findByText('Mua vật phẩm ở cửa hàng')).toBeOnTheScreen();
    expect(screen.getByText('-300 xu')).toBeOnTheScreen();
    expect(txSpy).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'SPEND_SHOP' }));
    await settle();
  });

  it('"Xem thêm" nạp trang kế bằng cursor', async () => {
    txSpy.mockResolvedValueOnce(page(['t1'], 'CUR1'));
    txSpy.mockResolvedValueOnce({
      data: [tx('t2', { refId: 'QUIZ_PASSED:z' })],
      meta: { hasMore: false, limit: 20, nextCursor: null },
    });
    await renderWithClient(<WalletScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Xem thêm' }));

    expect(await screen.findByText('Đạt bài kiểm tra')).toBeOnTheScreen();
    expect(txSpy).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'CUR1' }));
    expect(screen.queryByRole('button', { name: 'Xem thêm' })).toBeNull();
    await settle();
  });

  it('lịch sử rỗng nói cách kiếm xu; nhiệm vụ rỗng nói bằng chữ', async () => {
    txSpy.mockResolvedValue(page([]));
    questsSpy.mockResolvedValue([]);
    await renderWithClient(<WalletScreen />);

    expect(await screen.findByText('Chưa có giao dịch xu')).toBeOnTheScreen();
    expect(
      screen.getByText('Hoàn thành công việc đúng hạn hoặc ôn tập để nhận xu.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Hôm nay chưa có nhiệm vụ')).toBeOnTheScreen();
    await settle();
  });

  it('lỗi tải (mất mạng): khối lỗi có "Thử lại", bấm là tải lại', async () => {
    walletSpy.mockRejectedValueOnce(networkError());
    await renderWithClient(<WalletScreen />);

    expect(await screen.findByText('Không tải được số dư')).toBeOnTheScreen();
    walletSpy.mockResolvedValue(wallet({ balance: 5 }));
    // Nhiệm vụ và lịch sử tải được nên "Thử lại" duy nhất trên màn là của khối số dư.
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByLabelText('Số dư của bạn: 5 xu')).toBeOnTheScreen();
    await settle();
  });
});
