import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { showToast } from '@/shared/utils/toast.utils';

import { coinsService } from '../api/coins.service';
import type { BuyResult } from '../api/coins.types';
import { coinsKeys } from '../queries/coins.keys';
import { ShopScreen } from '../screens/ShopScreen';
import {
  apiError,
  entry,
  networkError,
  renderWithClient,
  settle,
  shopItem,
  wallet,
} from './coins.harness';

/**
 * app.md p7-02 §3/§4/§8: LUỒNG MUA — `Idempotency-Key` (GIỮ khi thử lại sau lỗi mạng, ĐỔI sau khi BE đã chốt câu trả lời 4xx như `COIN_001`), `COIN_002` chuyển tấm sang
 * "đã sở hữu", `COIN_003` đóng tấm + toast, lỗi mạng giữ TRONG tấm, thành công trừ xu + đổi "Đã có" + đóng tấm. (Danh mục + tấm xác nhận: `ShopScreen.test.tsx`.)
 */

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/shell/capabilities', () => ({ useFeature: () => true }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const walletSpy = jest.spyOn(coinsService, 'wallet');
const itemsSpy = jest.spyOn(coinsService, 'shopItems');
const buySpy = jest.spyOn(coinsService, 'buy');

const FRAME = shopItem('f1', { name: 'Khung vàng', price: 300 });
const THEME = shopItem('t1', {
  data: { accent: '#112233', primary: '#445566' },
  kind: 'PROFILE_THEME',
  name: 'Giao diện đêm',
  price: 500,
});

const bought = (over: Partial<BuyResult> = {}): BuyResult => ({
  balance: 950,
  inventoryItem: entry('inv1', { itemId: 'f1', item: null }),
  ...over,
});

const openFrame = async () =>
  fireEvent.press(await screen.findByRole('button', { name: 'Khung vàng' }));

beforeEach(() => {
  jest.clearAllMocks();
  walletSpy.mockResolvedValue(wallet({ balance: 1250 }));
  itemsSpy.mockResolvedValue([FRAME, THEME]);
});

describe('Mua thành công', () => {
  it('mua thành công: gửi Idempotency-Key, trừ xu, đổi "Đã có", đóng tấm và báo bằng toast', async () => {
    buySpy.mockResolvedValue(bought());
    await renderWithClient(<ShopScreen />);
    await openFrame();
    await screen.findByLabelText('Số dư của bạn: 1.250 xu');
    // Sau khi mua ví được tải lại từ server — mock phản ánh số mới.
    walletSpy.mockResolvedValue(wallet({ balance: 950 }));

    await fireEvent.press(await screen.findByRole('button', { name: 'Xác nhận mua' }));

    await waitFor(() => expect(buySpy).toHaveBeenCalledTimes(1));
    const [itemId, key] = buySpy.mock.calls[0]!;
    expect(itemId).toBe('f1');
    expect(key.length).toBeGreaterThanOrEqual(8);
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        'success',
        'Đã mua "Khung vàng". Vào Kho đồ để trang bị.',
      ),
    );
    expect(await screen.findByText('Đã có')).toBeOnTheScreen();
    expect(screen.queryByText('300 xu')).toBeNull();
    // Tấm đóng (kể cả khi số dư đổi làm `reset()` giữa chừng — đóng tấm không dựa vào callback của lượt mua).
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Xác nhận mua' })).toBeNull());
    await settle();
  });
});

describe('Idempotency-Key (be: cache 24 giờ CẢ 4xx)', () => {
  it('lỗi mạng ⇒ GIỮ khoá: bấm lại gửi CÙNG khoá (BE chỉ trừ xu một lần)', async () => {
    buySpy.mockRejectedValueOnce(networkError());
    buySpy.mockResolvedValueOnce(bought());
    await renderWithClient(<ShopScreen />);
    await openFrame();

    await fireEvent.press(await screen.findByRole('button', { name: 'Xác nhận mua' }));
    await waitFor(() => expect(buySpy).toHaveBeenCalledTimes(1));
    await settle();
    await fireEvent.press(screen.getByRole('button', { name: 'Xác nhận mua' }));
    await waitFor(() => expect(buySpy).toHaveBeenCalledTimes(2));

    expect(buySpy.mock.calls[1]![1]).toBe(buySpy.mock.calls[0]![1]);
    await settle();
  });

  it('COIN_001 (4xx đã chốt) ⇒ ĐỔI khoá; câu "còn thiếu" hiện trong tấm và ví được tải lại', async () => {
    buySpy.mockRejectedValueOnce(apiError(400, 'COIN_001', { balance: 100, required: 300 }));
    buySpy.mockResolvedValueOnce(bought());
    const { client } = await renderWithClient(<ShopScreen />);
    await openFrame();
    await screen.findByLabelText('Số dư của bạn: 1.250 xu');
    // Ví ở máy cũ (nói đủ xu) mà server nói thiếu ⇒ sau `COIN_001` ví được tải lại và ra số thật (100).
    walletSpy.mockResolvedValue(wallet({ balance: 100 }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Xác nhận mua' }));
    await waitFor(() => expect(buySpy).toHaveBeenCalledTimes(1));

    expect(await screen.findByText('Bạn còn thiếu 200 xu')).toBeOnTheScreen();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Xác nhận mua' })).toBeDisabled(),
    );

    // Người dùng kiếm thêm xu (thiết bị khác) ⇒ ví tải lại → đủ xu → mua lại bằng khoá MỚI.
    walletSpy.mockResolvedValue(wallet({ balance: 500 }));
    await act(async () => {
      await client.invalidateQueries({ queryKey: coinsKeys.wallet() });
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Xác nhận mua' })).toBeEnabled());
    await fireEvent.press(screen.getByRole('button', { name: 'Xác nhận mua' }));
    await waitFor(() => expect(buySpy).toHaveBeenCalledTimes(2));

    expect(buySpy.mock.calls[1]![1]).not.toBe(buySpy.mock.calls[0]![1]);
    await settle();
  });
});

describe('lỗi khi mua', () => {
  it('COIN_002 (đã sở hữu ở thiết bị khác): tấm chuyển sang "bạn đã sở hữu" sau khi làm mới', async () => {
    buySpy.mockRejectedValue(apiError(409, 'COIN_002'));
    await renderWithClient(<ShopScreen />);
    await openFrame();
    itemsSpy.mockResolvedValue([{ ...FRAME, inventoryId: 'inv9', owned: true }, THEME]);

    await fireEvent.press(await screen.findByRole('button', { name: 'Xác nhận mua' }));

    expect(
      await screen.findByText('Bạn đã sở hữu vật phẩm này. Vào Kho đồ để trang bị.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Xem Kho đồ' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Xác nhận mua' })).toBeNull();
    await settle();
  });

  it('COIN_003 (hết bán): toast câu của feature, danh sách làm mới không còn món đó và tấm đóng', async () => {
    buySpy.mockRejectedValue(apiError(404, 'COIN_003'));
    await renderWithClient(<ShopScreen />);
    await openFrame();
    itemsSpy.mockResolvedValue([THEME]);

    await fireEvent.press(await screen.findByRole('button', { name: 'Xác nhận mua' }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('error', 'Vật phẩm không còn được bán'),
    );
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Xác nhận mua' })).toBeNull());
    await settle();
  });

  it('lỗi mạng: câu hiện TRONG tấm (không toast), tấm vẫn mở để thử lại', async () => {
    buySpy.mockRejectedValue(networkError());
    await renderWithClient(<ShopScreen />);
    await openFrame();

    await fireEvent.press(await screen.findByRole('button', { name: 'Xác nhận mua' }));

    await waitFor(() => expect(buySpy).toHaveBeenCalled());
    expect(await screen.findByText(toErrorMessage(networkError()))).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Xác nhận mua' })).toBeEnabled();
    expect(showToast).not.toHaveBeenCalled();
    await settle();
  });
});
