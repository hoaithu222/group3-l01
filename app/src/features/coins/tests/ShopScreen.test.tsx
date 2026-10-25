import { fireEvent, screen } from '@testing-library/react-native';

import { coinsService } from '../api/coins.service';
import { ShopScreen } from '../screens/ShopScreen';
import { networkError, renderWithClient, settle, shopItem, wallet } from './coins.harness';

/**
 * app.md p7-02 §3: cửa hàng — tab loại (một lượt tải cho cả ba tab), vật phẩm đã có, dữ liệu vật phẩm hỏng không làm sập màn, lỗi tải, tấm xác nhận (giá · số dư ·
 * số dư sau mua · SỐ CÒN THIẾU khi không đủ xu). Luồng MUA (khoá idempotent, COIN_001/002/003): `ShopPurchase.test.tsx`.
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

const openFrame = async () =>
  fireEvent.press(await screen.findByRole('button', { name: 'Khung vàng' }));

beforeEach(() => {
  jest.clearAllMocks();
  walletSpy.mockResolvedValue(wallet({ balance: 1250 }));
  itemsSpy.mockResolvedValue([FRAME, THEME]);
});

describe('ShopScreen — danh mục', () => {
  it('mặc định tab Khung; đổi tab lọc theo loại ở máy (một lượt tải cho cả ba tab)', async () => {
    await renderWithClient(<ShopScreen />);

    expect(await screen.findByRole('button', { name: 'Khung vàng' })).toBeOnTheScreen();
    expect(screen.getByText('300 xu')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Giao diện đêm' })).toBeNull();

    await fireEvent.press(screen.getByRole('tab', { name: 'Giao diện' }));
    expect(await screen.findByRole('button', { name: 'Giao diện đêm' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Khung vàng' })).toBeNull();
    expect(itemsSpy).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole('tab', { name: 'Emoji' }));
    expect(await screen.findByText('Chưa có vật phẩm')).toBeOnTheScreen();
    expect(
      screen.getByText('Xu là điểm thưởng trong ứng dụng, không quy đổi ra tiền.'),
    ).toBeOnTheScreen();
    await settle();
  });

  it('vật phẩm đã có hiện "Đã có"/"Đang dùng" thay cho giá', async () => {
    itemsSpy.mockResolvedValue([
      { ...FRAME, inventoryId: 'inv1', owned: true },
      {
        ...shopItem('f2', { name: 'Khung bạc' }),
        equipped: true,
        inventoryId: 'inv2',
        owned: true,
      },
    ]);
    await renderWithClient(<ShopScreen />);

    expect(await screen.findByText('Đã có')).toBeOnTheScreen();
    expect(screen.getByText('Đang dùng')).toBeOnTheScreen();
    expect(screen.queryByText('300 xu')).toBeNull();
    await settle();
  });

  it('vật phẩm hỏng/thiếu `data` vẫn hiện tên + giá, không làm sập màn (data do admin nhập, đi tới mọi thiết bị)', async () => {
    itemsSpy.mockResolvedValue([
      shopItem('f1', { data: null, name: 'Khung hỏng' }),
      shopItem('f2', { data: { color: 'đỏ', width: 'x' }, name: 'Khung sai màu' }),
      shopItem('t1', {
        data: { primary: '#123456' },
        kind: 'PROFILE_THEME',
        name: 'Giao diện thiếu',
      }),
      shopItem('e1', { data: { emojis: 5 }, kind: 'EMOJI_PACK', name: 'Emoji sai' }),
    ]);
    await renderWithClient(<ShopScreen />);

    expect(await screen.findByRole('button', { name: 'Khung hỏng' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Khung sai màu' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Giao diện' }));
    expect(await screen.findByRole('button', { name: 'Giao diện thiếu' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Emoji' }));
    expect(await screen.findByRole('button', { name: 'Emoji sai' })).toBeOnTheScreen();
    await settle();
  });

  it('lỗi tải: khối lỗi có "Thử lại"', async () => {
    itemsSpy.mockRejectedValueOnce(networkError());
    await renderWithClient(<ShopScreen />);

    expect(await screen.findByText('Không tải được cửa hàng')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('button', { name: 'Khung vàng' })).toBeOnTheScreen();
    await settle();
  });
});

describe('PurchaseConfirmSheet', () => {
  it('nói giá, số dư hiện tại và số dư SAU khi mua', async () => {
    await renderWithClient(<ShopScreen />);
    await openFrame();

    expect(await screen.findByText('Số dư sau khi mua')).toBeOnTheScreen();
    expect(screen.getByLabelText('Số dư sau khi mua: 950 xu')).toBeOnTheScreen();
    expect(screen.getByLabelText('Giá: 300 xu')).toBeOnTheScreen();
    expect(screen.getByLabelText('Số dư của bạn: 1.250 xu')).toBeOnTheScreen();
    await settle();
  });

  it('thiếu xu: nói SỐ CÒN THIẾU, khoá nút mua và không gọi API', async () => {
    walletSpy.mockResolvedValue(wallet({ balance: 100 }));
    await renderWithClient(<ShopScreen />);
    await openFrame();

    expect(await screen.findByText('Bạn còn thiếu 200 xu')).toBeOnTheScreen();
    const confirm = screen.getByRole('button', { name: 'Xác nhận mua' });
    expect(confirm).toBeDisabled();
    await fireEvent.press(confirm);
    expect(buySpy).not.toHaveBeenCalled();
    await settle();
  });
});
