import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useGlobalSearchParams } from 'expo-router';

import { jobSettingsService } from '../api/career-settings.service';
import { offersService } from '../api/offers.service';
import type { OfferStatus } from '../api/recruiter.types';
import { OfferRow } from '../components/jobs/OfferRow';
import { OfferInboxScreen } from '../screens/jobs/OfferInboxScreen';
import { emitSocket, resetSocketMock } from './socket-mock';
import { httpError, makeOffer, makeSettings, renderWithClient } from './jobs-fixtures';

/**
 * app.md p6-08 §8: `OfferRow` hiện đúng nhãn 6 trạng thái; hộp thư lọc Tất cả/Mới/Quan tâm/Đã đóng, rỗng nói đúng lý do (Open to work tắt/bật), chạm mở chi tiết,
 * socket `offer:updated` vá dòng tại chỗ, 404 cờ tắt ⇒ "Chưa khả dụng".
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
const settings = jest.spyOn(jobSettingsService, 'get');

const LABELS: Record<OfferStatus, string> = {
  DECLINED: 'Đã từ chối',
  EXPIRED: 'Hết hạn',
  INTERESTED: 'Quan tâm',
  READ: 'Đã xem',
  SENT: 'Mới',
  WITHDRAWN: 'Đã thu hồi',
};

const page = (items: ReturnType<typeof makeOffer>[], nextCursor: string | null = null) => ({
  items,
  nextCursor,
});

beforeEach(() => {
  jest.clearAllMocks();
  resetSocketMock();
  mockIsTablet = false;
  jest.mocked(useGlobalSearchParams).mockReturnValue({});
  settings.mockResolvedValue(makeSettings({ openToWork: true }));
});

describe('OfferRow', () => {
  it.each(Object.entries(LABELS) as [OfferStatus, string][])(
    'trạng thái %s hiện nhãn "%s" bằng chữ',
    async (status, label) => {
      await render(<OfferRow offer={makeOffer({ status })} onPress={jest.fn()} />);
      expect(screen.getByText(label)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: new RegExp(`${label}$`) })).toBeOnTheScreen();
    },
  );

  it('lời mời có tin chưa đọc: nhãn trợ năng nói rõ số tin; chưa mở: có chấm "Chưa đọc"', async () => {
    const view = await render(
      <OfferRow
        offer={makeOffer({ status: 'INTERESTED', unreadMessages: 3 })}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('3 tin nhắn chưa đọc')).toBeOnTheScreen();
    await view.rerender(<OfferRow offer={makeOffer({ status: 'SENT' })} onPress={jest.fn()} />);
    expect(screen.getByLabelText('Chưa đọc')).toBeOnTheScreen();
  });
});

describe('OfferInboxScreen', () => {
  it('hiện danh sách, chạm một dòng mở chi tiết lời mời', async () => {
    list.mockResolvedValue(
      page([makeOffer(), makeOffer({ id: 'o2', status: 'INTERESTED', title: 'Backend Intern' })]),
    );
    await renderWithClient(<OfferInboxScreen />);

    expect(await screen.findByText('Thực tập sinh Frontend')).toBeOnTheScreen();
    expect(screen.getByText('Backend Intern')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /Backend Intern/ }));
    expect(router.push).toHaveBeenCalledWith('/me/career/offers/o2');
  });

  it('lọc: Mới = chưa trả lời (Mới + Đã xem), Quan tâm, Đã đóng = từ chối/thu hồi/hết hạn', async () => {
    list.mockResolvedValue(
      page([
        makeOffer({ id: 'a', status: 'SENT', title: 'Việc A' }),
        makeOffer({ id: 'b', status: 'READ', title: 'Việc B' }),
        makeOffer({ id: 'c', status: 'INTERESTED', title: 'Việc C' }),
        makeOffer({ id: 'd', status: 'DECLINED', title: 'Việc D' }),
        makeOffer({ id: 'e', status: 'EXPIRED', title: 'Việc E' }),
      ]),
    );
    await renderWithClient(<OfferInboxScreen />);
    await screen.findByText('Việc A');

    await fireEvent.press(screen.getByRole('radio', { name: 'Mới' }));
    expect(screen.getByText('Việc A')).toBeOnTheScreen();
    expect(screen.getByText('Việc B')).toBeOnTheScreen();
    expect(screen.queryByText('Việc C')).toBeNull();

    await fireEvent.press(screen.getByRole('radio', { name: 'Quan tâm' }));
    expect(screen.getByText('Việc C')).toBeOnTheScreen();
    expect(screen.queryByText('Việc A')).toBeNull();

    await fireEvent.press(screen.getByRole('radio', { name: 'Đã đóng' }));
    expect(screen.getByText('Việc D')).toBeOnTheScreen();
    expect(screen.getByText('Việc E')).toBeOnTheScreen();
    expect(screen.queryByText('Việc C')).toBeNull();
  });

  it('nhóm lọc mà còn trang chưa tải ⇒ tải nốt để không rỗng giả', async () => {
    list
      .mockResolvedValueOnce(
        page([makeOffer({ id: 'a', status: 'SENT', title: 'Việc A' })], 'cursor-2'),
      )
      .mockResolvedValueOnce(page([makeOffer({ id: 'z', status: 'DECLINED', title: 'Việc Z' })]));
    await renderWithClient(<OfferInboxScreen />);
    await screen.findByText('Việc A');

    await fireEvent.press(screen.getByRole('radio', { name: 'Đã đóng' }));
    expect(await screen.findByText('Việc Z')).toBeOnTheScreen();
    expect(list).toHaveBeenLastCalledWith('cursor-2');
  });

  it('rỗng khi Open to work TẮT ⇒ gợi ý bật Tìm việc + nút mở cài đặt; rỗng khi đang BẬT ⇒ "Chưa có lời mời nào"', async () => {
    list.mockResolvedValue(page([]));
    settings.mockResolvedValue(makeSettings({ openToWork: false }));
    const { screen: view } = await renderWithClient(<OfferInboxScreen />);

    expect(await screen.findByText('Bật Tìm việc để doanh nghiệp tìm thấy bạn')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Mở Tìm việc' }));
    expect(router.push).toHaveBeenCalledWith('/me/career/job-settings');
    await view.unmount();

    settings.mockResolvedValue(makeSettings({ openToWork: true }));
    await renderWithClient(<OfferInboxScreen />);
    expect(await screen.findByText('Chưa có lời mời nào')).toBeOnTheScreen();
  });

  it('socket offer:updated vá trạng thái ngay trên dòng (không chờ tải lại)', async () => {
    list.mockResolvedValue(page([makeOffer({ status: 'SENT' })]));
    await renderWithClient(<OfferInboxScreen />);
    await screen.findByText('Thực tập sinh Frontend');
    expect(screen.getAllByText('Mới').length).toBeGreaterThan(0);

    await emitSocket('offer:updated', {
      companyId: 'c1',
      offerId: 'o1',
      status: 'WITHDRAWN',
      threadLocked: true,
      v: 1,
    });
    await waitFor(() => expect(screen.getByText('Đã thu hồi')).toBeOnTheScreen());
  });

  it('cờ tắt (404 CFG_005) ⇒ "Chưa khả dụng", không có nút Thử lại; lỗi mạng ⇒ có Thử lại', async () => {
    list.mockRejectedValue(httpError(404, 'CFG_005'));
    const { screen: view } = await renderWithClient(<OfferInboxScreen />);
    expect(await screen.findByText('Chưa khả dụng')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    await view.unmount();

    list.mockRejectedValue(httpError(500, 'SYS_500'));
    await renderWithClient(<OfferInboxScreen />);
    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeOnTheScreen();
  });
});
