import { fireEvent, screen } from '@testing-library/react-native';
import { router, useGlobalSearchParams } from 'expo-router';

import { jobSettingsService } from '../api/career-settings.service';
import { offersService } from '../api/offers.service';
import { OfferInboxScreen } from '../screens/jobs/OfferInboxScreen';
import { makeOffer, makeSettings, renderWithClient } from './jobs-fixtures';
import { resetSocketMock } from './socket-mock';

/**
 * app.md p6-08 §7 (tiếp `OfferInboxScreen.test.tsx`): máy tính bảng — hộp thư ở cột TRÁI của `OffersSplitLayout`: chạm dòng THAY route ở khung phải (`replace`, không chồng ngăn xếp)
 * và dòng đang mở được tô + báo "đã chọn". Điện thoại thì `push` và không dòng nào "đã chọn". Hình dạng hai cột là NativeWind — Jest không thấy, phải xem trên máy tính bảng.
 */
let mockIsTablet = false;
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useGlobalSearchParams: jest.fn(() => ({})),
}));
// Giữ nguyên phần còn lại của `@/shared/theme` (`BottomSheet` đọc `height`/`width`) — chỉ thay bậc màn hình.
jest.mock('@/shared/theme', () => ({
  ...jest.requireActual('@/shared/theme'),
  useBreakpoint: () => ({
    height: 800,
    isLandscape: false,
    isTablet: mockIsTablet,
    tier: mockIsTablet ? 'tablet' : 'phone',
    width: mockIsTablet ? 900 : 390,
  }),
}));
jest.mock('@/core/socket', () => jest.requireActual('./socket-mock'));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));

const list = jest.spyOn(offersService, 'list');
const page = (items: ReturnType<typeof makeOffer>[]) => ({ items, nextCursor: null });

beforeEach(() => {
  jest.clearAllMocks();
  resetSocketMock();
  mockIsTablet = false;
  jest.mocked(useGlobalSearchParams).mockReturnValue({});
  jest.spyOn(jobSettingsService, 'get').mockResolvedValue(makeSettings({ openToWork: true }));
});

describe('OfferInboxScreen — bố cục hai cột', () => {
  it('máy tính bảng: chạm dòng THAY route ở khung phải (replace, không chồng ngăn xếp) và dòng đang mở được tô + báo "đã chọn"', async () => {
    mockIsTablet = true;
    jest.mocked(useGlobalSearchParams).mockReturnValue({ offerId: 'o2' });
    list.mockResolvedValue(page([makeOffer(), makeOffer({ id: 'o2', title: 'Backend Intern' })]));
    await renderWithClient(<OfferInboxScreen />);

    const open = await screen.findByRole('button', { name: /Backend Intern/, selected: true });
    expect(open).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: /Thực tập sinh Frontend/, selected: false }),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /Thực tập sinh Frontend/ }));
    expect(router.replace).toHaveBeenCalledWith('/me/career/offers/o1');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('điện thoại: không có dòng nào "đã chọn" dù đang ở một chi tiết (chỉ có nghĩa khi hai khung cùng hiện)', async () => {
    jest.mocked(useGlobalSearchParams).mockReturnValue({ offerId: 'o1' });
    list.mockResolvedValue(page([makeOffer()]));
    await renderWithClient(<OfferInboxScreen />);
    expect(
      await screen.findByRole('button', { name: /Thực tập sinh Frontend/, selected: false }),
    ).toBeOnTheScreen();
  });
});
