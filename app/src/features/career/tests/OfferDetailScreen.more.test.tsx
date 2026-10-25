import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';

import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

import { companyBlocksService } from '../api/company-blocks.service';
import { offersService } from '../api/offers.service';
import { OfferDetailScreen } from '../screens/jobs/OfferDetailScreen';
import { offerKeys } from '../queries/offers.keys';
import { makeClient } from './fixtures';
import { emitSocket, resetSocketMock } from './socket-mock';
import { COMPANY, httpError, makeDetail, makeOffer, renderWithClient } from './jobs-fixtures';

/**
 * app.md p6-08 §8 (tiếp `OfferDetailScreen.test.tsx`): socket `offer:updated WITHDRAWN` khi đang xem ⇒ ẩn nút Quan tâm; công ty SUSPENDED ⇒ banner; 404; menu "⋯" (Chặn/Báo cáo);
 * JD lấy URL MỚI lúc bấm; liên kết trong nội dung chỉ mở sau khi xác nhận.
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ offerId: 'o1' })),
}));
jest.mock('@/core/socket', () => jest.requireActual('./socket-mock'));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

const get = jest.spyOn(offersService, 'get');
const block = jest.spyOn(companyBlocksService, 'block');
const report = jest.spyOn(companyBlocksService, 'reportOffer');

beforeEach(() => {
  jest.clearAllMocks();
  resetSocketMock();
  useAuthStore.setState({
    user: { email: 'sv@truong.edu.vn', id: 'u1', name: 'Sinh viên', permissions: [], roles: [] },
  });
});

describe('OfferDetailScreen — thời gian thực và trạng thái', () => {
  it('socket offer:updated WITHDRAWN khi đang xem ⇒ nút Quan tâm biến mất, hiện "Đã thu hồi"', async () => {
    get
      .mockResolvedValueOnce(makeDetail())
      .mockResolvedValue(makeDetail({ status: 'WITHDRAWN', threadLocked: true }));
    await renderWithClient(<OfferDetailScreen />);
    expect(await screen.findByRole('button', { name: 'Quan tâm' })).toBeOnTheScreen();

    await emitSocket('offer:updated', {
      companyId: 'c1',
      offerId: 'o1',
      status: 'WITHDRAWN',
      threadLocked: true,
      v: 1,
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Quan tâm' })).toBeNull());
    expect(screen.getAllByText('Đã thu hồi').length).toBeGreaterThan(0);
  });

  it('công ty tạm ngưng ⇒ banner + không còn Quan tâm (vẫn Từ chối khéo được)', async () => {
    get.mockResolvedValue(makeDetail({ company: { ...COMPANY, status: 'SUSPENDED' } }));
    await renderWithClient(<OfferDetailScreen />);

    expect(await screen.findByText('Doanh nghiệp đang tạm ngưng')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Quan tâm' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Từ chối khéo' })).toBeOnTheScreen();
  });

  it('404 ⇒ "Lời mời không còn" (không phải lỗi mạng, không có Thử lại)', async () => {
    get.mockRejectedValue(httpError(404, 'RES_001'));
    await renderWithClient(<OfferDetailScreen />);
    expect(await screen.findByText('Lời mời không còn')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });
});

describe('OfferDetailScreen — menu, JD, liên kết', () => {
  it('menu "⋯": Chặn doanh nghiệp có hộp thoại xác nhận rồi mới gọi API', async () => {
    get.mockResolvedValue(makeDetail());
    block.mockResolvedValue();
    await renderWithClient(<OfferDetailScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Thêm tuỳ chọn cho lời mời' }));
    await fireEvent.press(await screen.findByText('Chặn doanh nghiệp'));
    expect(await screen.findByText('Chặn Công ty Alpha?')).toBeOnTheScreen();
    expect(block).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Chặn' }));

    await waitFor(() => expect(block).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('success', 'Đã chặn doanh nghiệp'));
  });

  it('menu "⋯": Báo cáo lời mời gửi POST /reports với đích JOB_OFFER (mặc định SPAM)', async () => {
    get.mockResolvedValue(makeDetail());
    report.mockResolvedValue({ alreadyReported: false });
    await renderWithClient(<OfferDetailScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Thêm tuỳ chọn cho lời mời' }));
    await fireEvent.press(await screen.findByText('Báo cáo lời mời'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Gửi báo cáo' }));

    await waitFor(() => expect(report).toHaveBeenCalledWith('o1', 'SPAM', undefined));
  });

  it('JD: lấy URL MỚI lúc bấm (URL ký sống ~60 giây) rồi mở trình duyệt', async () => {
    get
      .mockResolvedValueOnce(makeDetail({ jdUrl: 'https://cdn/jd?sig=cu' }))
      .mockResolvedValue(makeDetail({ jdUrl: 'https://cdn/jd?sig=moi' }));
    await renderWithClient(<OfferDetailScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Xem mô tả công việc (PDF)' }));
    await waitFor(() =>
      expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://cdn/jd?sig=moi'),
    );
  });

  it('liên kết trong nội dung: chạm ⇒ hộp thoại xác nhận, chỉ "Mở liên kết" mới mở ngoài; dấu câu cuối không dính vào link', async () => {
    get.mockResolvedValue(makeDetail({ message: 'Xem mô tả tại https://example.com/jd. Cảm ơn!' }));
    await renderWithClient(<OfferDetailScreen />);

    await fireEvent.press(await screen.findByText('https://example.com/jd'));
    expect(await screen.findByText('Mở liên kết ngoài ứng dụng?')).toBeOnTheScreen();
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Mở liên kết' }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://example.com/jd');
  });

  it('mở lần đầu (server đổi SENT → READ): dòng trong danh sách được vá NGAY theo bản chi tiết, không chờ socket', async () => {
    const client = makeClient();
    client.setQueryData(offerKeys.list(), {
      pageParams: [undefined],
      pages: [{ items: [makeOffer({ readAt: null, status: 'SENT' })], nextCursor: null }],
    });
    get.mockResolvedValue(makeDetail({ readAt: '2026-09-27T09:00:00.000Z', status: 'READ' }));
    await renderWithClient(<OfferDetailScreen />, client);

    await screen.findByText('Thực tập sinh Frontend');
    const list = client.getQueryData<{
      pages: { items: { readAt: string | null; status: string }[] }[];
    }>(offerKeys.list());
    expect(list?.pages[0]?.items[0]).toEqual(
      expect.objectContaining({ readAt: '2026-09-27T09:00:00.000Z', status: 'READ' }),
    );
  });
});
