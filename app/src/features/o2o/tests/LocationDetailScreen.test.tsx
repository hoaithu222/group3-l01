import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';

import { locationsService } from '../api/locations.service';
import { LocationDetailScreen } from '../screens/LocationDetailScreen';
import { makeDetail, makeShop, apiError, renderWithProviders } from './o2o-test-utils';

/** Chi tiết địa điểm — nội dung, chỉ đường, khối tiệm in, và lỗi 404/mất mạng. */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('../api/locations.service', () => ({
  REVIEWS_PAGE_SIZE: 10,
  locationsService: {
    detail: jest.fn(),
    reviews: jest.fn(),
    saveMyReview: jest.fn(),
    deleteMyReview: jest.fn(),
  },
}));

const service = jest.mocked(locationsService);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({ locationId: 'loc-2' });
  service.detail.mockResolvedValue(makeDetail());
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});
afterEach(() => jest.restoreAllMocks());

describe('LocationDetailScreen — nội dung', () => {
  it('tên, loại + địa chỉ, tiện ích bằng chữ, giờ mở HÔM NAY, độ ồn/sao bằng chữ', async () => {
    await renderWithProviders(<LocationDetailScreen />);

    expect((await screen.findAllByText('In nhanh Bách Khoa')).length).toBeGreaterThan(0);
    expect(screen.getByText(/Tiệm in · 12 Tạ Quang Bửu/)).toBeOnTheScreen();
    expect(screen.getByText('Wi-Fi nhanh')).toBeOnTheScreen();
    expect(screen.getByText('Ổ cắm điện')).toBeOnTheScreen();
    expect(screen.getByText('4,5 sao (12) · Yên tĩnh')).toBeOnTheScreen();
    expect(screen.getByText('Độ ồn trung bình: Yên tĩnh')).toBeOnTheScreen();
    expect(screen.getByText('Giờ mở cửa')).toBeOnTheScreen();
  });

  it('"Chỉ đường" mở liên kết bản đồ mang đúng toạ độ địa điểm', async () => {
    await renderWithProviders(<LocationDetailScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Chỉ đường' }));

    expect(Linking.openURL).toHaveBeenCalledWith(expect.stringContaining('21.0049,105.8431'));
  });

  it('không có app bản đồ nhận liên kết → báo lỗi, không im lặng', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler'));
    await renderWithProviders(<LocationDetailScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Chỉ đường' }));

    await waitFor(() => expect(Linking.openURL).toHaveBeenCalled());
  });
});

describe('LocationDetailScreen — khối tiệm in', () => {
  it('bảng giá theo NĂNG LỰC (tiệm không in A3/màu thì không liệt kê dòng đó) + "Đặt in" → màn cấu hình với shopId', async () => {
    service.detail.mockResolvedValue(
      makeDetail({
        shop: makeShop({ capabilities: { color: true, duplex: true, a3: false, binding: false } }),
      }),
    );
    await renderWithProviders(<LocationDetailScreen />);

    expect(await screen.findByText('A4 đen trắng')).toBeOnTheScreen();
    expect(screen.getByText('A4 màu')).toBeOnTheScreen();
    expect(screen.queryByText('A3 đen trắng')).toBeNull();
    expect(screen.queryByText('A3 màu')).toBeNull();
    expect(screen.getByText('500 VND/trang')).toBeOnTheScreen();
    expect(screen.getByText('Giảm 10%')).toBeOnTheScreen();
    expect(screen.getByText('Đang nhận đơn')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Đặt in' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/me/o2o/print/new',
      params: { shopId: 'shop-1', locationName: 'In nhanh Bách Khoa' },
    });
  });

  it('tiệm tạm ngưng nhận đơn → nút "Đặt in" bị khoá, nói rõ lý do', async () => {
    service.detail.mockResolvedValue(makeDetail({ shop: makeShop({ acceptingOrders: false }) }));
    await renderWithProviders(<LocationDetailScreen />);

    const button = await screen.findByRole('button', { name: 'Tiệm tạm ngưng nhận đơn' });
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('địa điểm không phải tiệm in (không có shop) → không có khối đặt in', async () => {
    service.detail.mockResolvedValue(makeDetail({ type: 'CAFE', shop: null }));
    await renderWithProviders(<LocationDetailScreen />);

    await screen.findByText('Giờ mở cửa');
    expect(screen.queryByText('Đặt in tại đây')).toBeNull();
  });
});

describe('LocationDetailScreen — lỗi', () => {
  it('404 (O2O_010) → "Địa điểm không còn hiển thị", KHÔNG có "Thử lại" (thử lại vẫn 404)', async () => {
    service.detail.mockRejectedValue(apiError(404, 'O2O_010'));
    await renderWithProviders(<LocationDetailScreen />);

    expect(await screen.findByText('Địa điểm không còn hiển thị')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('mất mạng → có "Thử lại" gọi lại', async () => {
    service.detail.mockRejectedValueOnce(
      Object.assign(new Error('Network Error'), { isAxiosError: true }),
    );
    await renderWithProviders(<LocationDetailScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Thử lại' }));
    expect((await screen.findAllByText('In nhanh Bách Khoa')).length).toBeGreaterThan(0);
  });
});
