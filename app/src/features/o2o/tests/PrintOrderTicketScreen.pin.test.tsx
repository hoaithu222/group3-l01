import { fireEvent, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';

import { useAuthStore } from '@/shell/store/slices/auth';

import type { PrintOrderView } from '../api/o2o.types';
import { printService } from '../api/print.service';
import { PrintOrderTicketScreen } from '../screens/PrintOrderTicketScreen';
import { clearPin, readPin, savePin } from '../utils/pin-vault';
import { makeOrder, apiError, renderWithProviders } from './o2o-test-utils';

/** Vé đơn — máy không còn giữ PIN ("Tạo PIN mới"), PIN theo người dùng, và lỗi 404/mất mạng. */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('../api/print.service', () => ({
  ORDERS_PAGE_SIZE: 20,
  printService: { get: jest.fn(), cancel: jest.fn(), regeneratePin: jest.fn() },
}));

const service = jest.mocked(printService);

const order = (over: Partial<PrintOrderView> = {}) => makeOrder(over);
const NO_ACTIONS = { canEdit: false, canSubmit: false, canCancel: false, canRegeneratePin: false };

beforeEach(async () => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: 'u1', name: 'Tôi' } as never });
  jest.mocked(useLocalSearchParams).mockReturnValue({ orderId: 'ord-1' });
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  await clearPin('u1', 'ord-1');
  service.get.mockResolvedValue(order());
});
afterEach(() => jest.restoreAllMocks());

describe('vé đơn — máy không còn giữ PIN', () => {
  it('"Tạo PIN mới": gọi server, hiện PIN mới, CẤT vào kho khoá; mã cũ vô hiệu', async () => {
    service.regeneratePin.mockResolvedValue({ order: order(), pin: '739105' });
    await renderWithProviders(<PrintOrderTicketScreen />);

    expect(await screen.findByText(/Máy này không còn giữ mã PIN của đơn/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tạo PIN mới' }));

    expect(await screen.findByText('739 105')).toBeOnTheScreen();
    expect(service.regeneratePin).toHaveBeenCalledWith('ord-1');
    expect(await readPin('u1', 'ord-1')).toBe('739105');
    expect(screen.queryByText(/Máy này không còn giữ/)).toBeNull();
  });

  it('server không cho tạo PIN mới (canRegeneratePin false) → nút khoá', async () => {
    service.get.mockResolvedValue(order({ myActions: { ...NO_ACTIONS, canCancel: true } }));
    await renderWithProviders(<PrintOrderTicketScreen />);

    expect(await screen.findByRole('button', { name: 'Tạo PIN mới' })).toBeDisabled();
  });

  it('PIN của NGƯỜI KHÁC trên cùng máy không lộ: khoá theo userId', async () => {
    await savePin('u-khac', 'ord-1', '111222');
    await renderWithProviders(<PrintOrderTicketScreen />);

    expect(await screen.findByText(/Máy này không còn giữ mã PIN của đơn/)).toBeOnTheScreen();
    expect(screen.queryByText('111 222')).toBeNull();
    await clearPin('u-khac', 'ord-1');
  });
});

describe('vé đơn — lỗi', () => {
  it('404 (đơn không tồn tại hoặc KHÔNG phải của mình) → "Không tìm thấy đơn in", không có Thử lại', async () => {
    service.get.mockRejectedValue(apiError(404, 'PERM_404'));
    await renderWithProviders(<PrintOrderTicketScreen />);

    expect(await screen.findByText('Không tìm thấy đơn in')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('mất mạng → Thử lại tải lại đơn', async () => {
    service.get.mockRejectedValueOnce(
      Object.assign(new Error('Network Error'), { isAxiosError: true }),
    );
    await renderWithProviders(<PrintOrderTicketScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Thử lại' }));
    expect((await screen.findAllByText('Chờ tiệm nhận')).length).toBeGreaterThan(0);
  });
});
