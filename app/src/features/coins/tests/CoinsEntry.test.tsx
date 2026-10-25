import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { SocketEvent } from '@/core/socket';
import { useFeature } from '@/shell/capabilities';

import { coinsService } from '../api/coins.service';
import { CoinsMeRow } from '../components/CoinsMeRow';
import { HomeCoinsWidget } from '../components/home/HomeCoinsWidget';
import { useCoinsEvents } from '../hooks/useCoinsEvents';
import { coinsKeys } from '../queries/coins.keys';
import { COINS_HREF } from '../utils/coins-routes';
import { mockSocket, quest, renderWithClient, settle, wallet } from './coins.harness';

/**
 * Lối vào p7-02: hàng "Xu và cửa hàng" ở màn Tôi và widget số dư ở Trang chủ (số có chữ "xu", bấm mở Ví, đổi ngay theo socket), và tắt cờ `coins` ⇒ ẩn HOÀN TOÀN
 * (không hàng, không widget, không gọi API, không nghe socket). Cây route + nơi lắp ráp: `CoinsAssembly.test.tsx`.
 */
// Số dư chạy dần (`AnimatedNumber`) đổi state theo khung hình — ngoài `act` của test nên React báo cảnh báo; bật "Giảm chuyển động" để test xác định.
// Hoạt ảnh có test riêng ở `tests/ui/motion.test.tsx`.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => true,
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn() }));

const walletSpy = jest.spyOn(coinsService, 'wallet');
const questsSpy = jest.spyOn(coinsService, 'quests');

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useFeature).mockReturnValue(true);
  walletSpy.mockResolvedValue(wallet());
  questsSpy.mockResolvedValue([quest('q1', { claimable: true }), quest('q2', { claimable: true })]);
});

describe('CoinsMeRow — hàng ở màn Tôi', () => {
  it('cờ bật: có hàng kèm số dư có chữ "xu", bấm mở Ví', async () => {
    await renderWithClient(<CoinsMeRow />);

    expect(await screen.findByLabelText(/^Xu và cửa hàng: 1\.250 xu/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Xu và cửa hàng'));
    expect(router.push).toHaveBeenCalledWith(COINS_HREF);
    await settle();
  });

  it.each([false, undefined])(
    'cờ %s (tắt hoặc chưa tải): KHÔNG hiện và KHÔNG gọi API (BE sẽ trả 404)',
    async (flag) => {
      jest.mocked(useFeature).mockReturnValue(flag);
      await renderWithClient(<CoinsMeRow />);
      await settle();

      expect(screen.queryByText('Xu và cửa hàng')).toBeNull();
      expect(walletSpy).not.toHaveBeenCalled();
    },
  );
});

describe('HomeCoinsWidget — Trang chủ', () => {
  it('số dư kèm chữ "xu", trần ngày và số nhiệm vụ đang chờ nhận; "Chi tiết" mở Ví', async () => {
    await renderWithClient(<HomeCoinsWidget />);

    expect(await screen.findByText('1.250 xu')).toBeOnTheScreen();
    expect(screen.getByText('Hôm nay đã nhận 40/200 xu từ hoạt động')).toBeOnTheScreen();
    expect(await screen.findByText('2 nhiệm vụ có thể nhận thưởng')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Mở ví xu' }));
    expect(router.push).toHaveBeenCalledWith(COINS_HREF);
    await settle();
  });

  it('không có nhiệm vụ chờ nhận ⇒ không có dòng đó (không "0 nhiệm vụ")', async () => {
    questsSpy.mockResolvedValue([quest('q1')]);
    await renderWithClient(<HomeCoinsWidget />);

    await screen.findByText('1.250 xu');
    await settle();
    expect(screen.queryByText(/nhiệm vụ có thể nhận thưởng/)).toBeNull();
  });

  it('lỗi tải ví ⇒ ẩn hẳn (không bịa số)', async () => {
    walletSpy.mockRejectedValue(new Error('boom'));
    await renderWithClient(<HomeCoinsWidget />);
    await settle();

    expect(screen.queryByText('Xu của bạn')).toBeNull();
    expect(screen.queryByText(/xu$/)).toBeNull();
  });

  it.each([false, undefined])('cờ %s ⇒ ẩn và không gọi API', async (flag) => {
    jest.mocked(useFeature).mockReturnValue(flag);
    await renderWithClient(<HomeCoinsWidget />);
    await settle();

    expect(screen.queryByText('Xu của bạn')).toBeNull();
    expect(walletSpy).not.toHaveBeenCalled();
    expect(questsSpy).not.toHaveBeenCalled();
  });

  it('nghe socket: số dư ở Trang chủ đổi ngay khi nhận xu', async () => {
    await renderWithClient(<HomeCoinsWidget />);
    await screen.findByText('1.250 xu');
    walletSpy.mockResolvedValue(wallet({ balance: 1400 }));

    await act(async () => {
      mockSocket.__emitServer(SocketEvent.GAMIFICATION_UPDATED, {
        coins: { balance: 1400, delta: 150, reason: 'QUEST' },
      });
    });

    expect(await screen.findByText('1.400 xu')).toBeOnTheScreen();
    await settle();
  });
});

describe('useCoinsEvents khi cờ tắt', () => {
  function Listener() {
    useCoinsEvents();
    return null;
  }

  it('bỏ qua sự kiện coins: không vá cache, không tải lại ví', async () => {
    jest.mocked(useFeature).mockReturnValue(false);
    const { client } = await renderWithClient(<Listener />);
    client.setQueryData(coinsKeys.wallet(), wallet({ balance: 10 }));

    await act(async () => {
      mockSocket.__emitServer(SocketEvent.GAMIFICATION_UPDATED, {
        coins: { balance: 999, delta: 989, reason: 'ADJUST' },
      });
    });

    expect(client.getQueryData<{ balance: number }>(coinsKeys.wallet())?.balance).toBe(10);
    expect(walletSpy).not.toHaveBeenCalled();
  });
});

describe('useCoinsEvents khi cờ bật', () => {
  function Listener() {
    useCoinsEvents();
    return null;
  }

  it('socket nối lại ⇒ tải lại ví (sự kiện phát lúc offline không được phát lại)', async () => {
    const { client } = await renderWithClient(<Listener />);
    await client.prefetchQuery({
      queryFn: () => coinsService.wallet(),
      queryKey: coinsKeys.wallet(),
    });
    expect(client.getQueryState(coinsKeys.wallet())?.isInvalidated).toBe(false);

    await act(async () => {
      mockSocket.__emitServer('connect');
    });

    // Không có màn nào đang xem ví ⇒ chỉ đánh dấu cũ; lần mở màn kế tiếp tải lại (màn đang mở thì tải ngay — xem ca "nghe socket" ở widget Trang chủ).
    expect(client.getQueryState(coinsKeys.wallet())?.isInvalidated).toBe(true);
  });
});
