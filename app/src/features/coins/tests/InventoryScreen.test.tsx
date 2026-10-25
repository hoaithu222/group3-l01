import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';

import { coinsService } from '../api/coins.service';
import type { InventoryEntry } from '../api/coins.types';
import { COINS_SHOP_HREF } from '../utils/coins-routes';
import { InventoryScreen } from '../screens/InventoryScreen';
import { apiError, entry, renderWithClient, settle } from './coins.harness';

/**
 * app.md p7-02 §3/§4: kho đồ — nhóm theo loại, trang bị/tháo LẠC QUAN (mỗi loại tối đa MỘT món đang dùng), lỗi ⇒ trả về bản cũ + toast, rỗng ⇒ mời ghé Cửa hàng.
 */

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/shell/capabilities', () => ({ useFeature: () => true }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const inventorySpy = jest.spyOn(coinsService, 'inventory');
const equipSpy = jest.spyOn(coinsService, 'equip');
const unequipSpy = jest.spyOn(coinsService, 'unequip');

const F1 = entry('f1', { equipped: true });
const F2 = entry('f2');
const THEME = entry('t1', {
  item: {
    assetId: null,
    availableFrom: null,
    availableTo: null,
    code: 'T1',
    data: { accent: '#112233', primary: '#445566' },
    id: 'item-t1',
    kind: 'PROFILE_THEME',
    name: 'Giao diện đêm',
    price: 500,
  },
  kind: 'PROFILE_THEME',
});

/** Promise treo để soi trạng thái LẠC QUAN trước khi server trả lời. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  inventorySpy.mockResolvedValue([F1, F2, THEME]);
});

describe('InventoryScreen', () => {
  it('nhóm theo loại; món đang dùng ghi "Đang dùng" bằng chữ; chỉ hiện nhóm có vật phẩm', async () => {
    await renderWithClient(<InventoryScreen />);

    expect(await screen.findByText('Khung ảnh đại diện')).toBeOnTheScreen();
    expect(screen.getByText('Giao diện hồ sơ')).toBeOnTheScreen();
    expect(screen.queryByText('Gói emoji')).toBeNull();
    expect(screen.getByText('Đang dùng')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Tháo Khung f1' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Trang bị Khung f2' })).toBeOnTheScreen();
    await settle();
  });

  it('trang bị món mới: đổi NGAY (chưa chờ server) và tháo món cùng loại, không đụng loại khác', async () => {
    const pending = deferred<InventoryEntry>();
    equipSpy.mockReturnValue(pending.promise);
    await renderWithClient(<InventoryScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Trang bị Khung f2' }));

    await waitFor(() => expect(equipSpy).toHaveBeenCalledWith('f2'));
    expect(await screen.findByRole('button', { name: 'Tháo Khung f2' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Trang bị Khung f1' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Trang bị Giao diện đêm' })).toBeOnTheScreen();

    inventorySpy.mockResolvedValue([{ ...F1, equipped: false }, { ...F2, equipped: true }, THEME]);
    pending.resolve({ ...F2, equipped: true });
    await settle();
    expect(screen.getByRole('button', { name: 'Tháo Khung f2' })).toBeOnTheScreen();
  });

  it('server từ chối: trả về bản cũ và toast bằng câu của feature', async () => {
    equipSpy.mockRejectedValue(apiError(404, 'RES_001'));
    await renderWithClient(<InventoryScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Trang bị Khung f2' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('error', expect.any(String)));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Tháo Khung f1' })).toBeOnTheScreen(),
    );
    expect(screen.getByRole('button', { name: 'Trang bị Khung f2' })).toBeOnTheScreen();
    await settle();
  });

  it('tháo món đang dùng gọi đúng endpoint tháo', async () => {
    unequipSpy.mockResolvedValue({ ...F1, equipped: false });
    await renderWithClient(<InventoryScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Tháo Khung f1' }));

    await waitFor(() => expect(unequipSpy).toHaveBeenCalledWith('f1'));
    expect(equipSpy).not.toHaveBeenCalled();
    await settle();
  });

  it('vật phẩm đã bị gỡ khỏi danh mục vẫn hiện (đã mua thì không biến mất khỏi kho)', async () => {
    inventorySpy.mockResolvedValue([entry('old', { item: null })]);
    await renderWithClient(<InventoryScreen />);

    expect(await screen.findByText('Vật phẩm không còn bán')).toBeOnTheScreen();
    await settle();
  });

  it('kho rỗng: mời ghé Cửa hàng và bấm là mở Cửa hàng', async () => {
    inventorySpy.mockResolvedValue([]);
    await renderWithClient(<InventoryScreen />);

    expect(await screen.findByText('Chưa có vật phẩm')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Đến Cửa hàng' }));
    expect(router.push).toHaveBeenCalledWith(COINS_SHOP_HREF);
    await settle();
  });
});
