import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';

import { locationsService } from '../api/locations.service';
import { LocationDetailScreen } from '../screens/LocationDetailScreen';
import { makeDetail, makeReview, apiError, renderWithProviders } from './o2o-test-utils';

/** Chi tiết địa điểm — đánh giá: lỗi đúng ô, PUT đúng thân, lỗi server ngay trong tờ, sửa/xoá, xem tất cả (cursor). */
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

describe('LocationDetailScreen — đánh giá', () => {
  it('gửi khi chưa chọn → lỗi ĐÚNG ô (số sao, độ ồn), không gọi server', async () => {
    await renderWithProviders(<LocationDetailScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Viết đánh giá' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Gửi đánh giá' }));

    expect(await screen.findByText('Hãy chọn số sao')).toBeOnTheScreen();
    expect(screen.getByText('Hãy chọn độ ồn')).toBeOnTheScreen();
    expect(service.saveMyReview).not.toHaveBeenCalled();
  });

  it('chọn sao + độ ồn + bình luận → PUT đúng thân yêu cầu, rồi làm mới chi tiết', async () => {
    service.saveMyReview.mockResolvedValue({
      review: makeReview({ mine: true }),
      location: { id: 'loc-2', ratingAvg: 4.6, ratingCount: 13, noiseAvg: 1.9 },
    });
    await renderWithProviders(<LocationDetailScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Viết đánh giá' }));

    await fireEvent.press(await screen.findByRole('radio', { name: '5 trên 5 sao' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Yên tĩnh' }));
    await fireEvent.changeText(
      screen.getByPlaceholderText(/Chia sẻ điều bạn thấy/),
      '  Wifi rất nhanh  ',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    await waitFor(() =>
      expect(service.saveMyReview).toHaveBeenCalledWith('loc-2', {
        rating: 5,
        noise: 2,
        comment: 'Wifi rất nhanh',
      }),
    );
    await waitFor(() => expect(service.detail).toHaveBeenCalledTimes(2));
  });

  it('lỗi từ server hiện NGAY TRONG tờ (giữ nguyên thứ đã nhập), không chỉ toast', async () => {
    service.saveMyReview.mockRejectedValue(apiError(404, 'O2O_010'));
    await renderWithProviders(<LocationDetailScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Viết đánh giá' }));
    await fireEvent.press(await screen.findByRole('radio', { name: '4 trên 5 sao' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Vừa phải' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    expect(await screen.findByText('Địa điểm này không còn hiển thị.')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: '4 trên 5 sao' })).toBeChecked();
  });

  it('đã có đánh giá của tôi → "Sửa đánh giá của bạn", form nạp sẵn, "Xoá đánh giá" gọi DELETE', async () => {
    service.detail.mockResolvedValue(
      makeDetail({
        myReview: makeReview({ id: 'rv-me', mine: true, rating: 3, noise: 4, comment: 'Hơi ồn' }),
      }),
    );
    service.deleteMyReview.mockResolvedValue(undefined);
    await renderWithProviders(<LocationDetailScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Sửa đánh giá của bạn' }));
    expect(await screen.findByDisplayValue('Hơi ồn')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: '3 trên 5 sao' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Hơi ồn' })).toBeChecked();

    // Xoá không hoàn tác được ⇒ bước xác nhận ngay trong chân tấm: bấm "Xoá đánh giá" CHƯA gọi DELETE.
    await fireEvent.press(screen.getByRole('button', { name: 'Xoá đánh giá' }));
    expect(service.deleteMyReview).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Xác nhận xoá' }));
    await waitFor(() => expect(service.deleteMyReview).toHaveBeenCalledWith('loc-2'));
  });

  it('còn nhiều hơn 5 đánh giá → "Xem tất cả" mở danh sách đầy đủ (cursor)', async () => {
    service.detail.mockResolvedValue(makeDetail({ ratingCount: 30 }));
    service.reviews.mockResolvedValue({
      items: [
        makeReview({ id: 'rv-9', author: { id: 'u-9', name: 'Minh' }, comment: 'Chỗ ngồi rộng' }),
      ],
      meta: { nextCursor: null, hasMore: false, limit: 10 },
    });
    await renderWithProviders(<LocationDetailScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Xem tất cả 30 đánh giá' }));
    expect(await screen.findByText('Chỗ ngồi rộng')).toBeOnTheScreen();
    expect(service.reviews).toHaveBeenCalledWith('loc-2', undefined);
  });
});
