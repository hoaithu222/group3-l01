import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

import { offersService } from '../api/offers.service';
import { OfferDetailScreen } from '../screens/jobs/OfferDetailScreen';
import { resetSocketMock } from './socket-mock';
import { httpError, makeDetail, renderWithClient } from './jobs-fixtures';

/**
 * app.md p6-08 §8 (RNTL): `InterestedSheet` mặc định KHÔNG chia sẻ email; Quan tâm/Từ chối/Chặn/Báo cáo; `RECR_009` ⇒ tải lại + toast; socket `offer:updated WITHDRAWN` khi đang
 * xem ⇒ ẩn nút Quan tâm; công ty SUSPENDED ⇒ banner + không còn Quan tâm; JD lấy URL MỚI lúc bấm; liên kết trong nội dung chỉ mở sau khi xác nhận.
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ offerId: 'o1' })),
}));
jest.mock('@/core/socket', () => jest.requireActual('./socket-mock'));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const get = jest.spyOn(offersService, 'get');
const interested = jest.spyOn(offersService, 'interested');
const decline = jest.spyOn(offersService, 'decline');

beforeEach(() => {
  jest.clearAllMocks();
  resetSocketMock();
  useAuthStore.setState({
    user: { email: 'sv@truong.edu.vn', id: 'u1', name: 'Sinh viên', permissions: [], roles: [] },
  });
});

describe('OfferDetailScreen — hành động', () => {
  it('hiện doanh nghiệp, tiêu đề, nội dung; đang chờ trả lời ⇒ có Quan tâm + Từ chối khéo', async () => {
    get.mockResolvedValue(makeDetail());
    await renderWithClient(<OfferDetailScreen />);

    expect(await screen.findByText('Thực tập sinh Frontend')).toBeOnTheScreen();
    expect(screen.getByText('Công ty Alpha')).toBeOnTheScreen();
    expect(screen.getByText('Đã xác minh')).toBeOnTheScreen();
    expect(screen.getByText(/huy hiệu ReactJS/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Quan tâm' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Từ chối khéo' })).toBeOnTheScreen();
  });

  it('InterestedSheet mặc định KHÔNG chia sẻ email; bật công tắc mới gửi shareEmail = true; xong ⇒ có nút Trao đổi', async () => {
    get.mockResolvedValue(makeDetail());
    interested.mockResolvedValue(makeDetail({ status: 'INTERESTED', threadOpen: true }));
    await renderWithClient(<OfferDetailScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Quan tâm' }));
    expect(
      await screen.findByText(/Doanh nghiệp này sẽ thấy email sv@truong.edu.vn/),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('switch', { name: 'Chia sẻ email của tôi với doanh nghiệp này' }),
    ).not.toBeChecked();
    await fireEvent.press(screen.getByRole('button', { name: 'Bày tỏ quan tâm' }));

    await waitFor(() => expect(interested).toHaveBeenCalledWith('o1', false));
    expect(await screen.findByRole('button', { name: 'Trao đổi' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Quan tâm' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Trao đổi' }));
    expect(router.push).toHaveBeenCalledWith('/me/career/offers/o1/thread');
  });

  it('bật "Chia sẻ email" ⇒ gửi shareEmail = true', async () => {
    get.mockResolvedValue(makeDetail());
    interested.mockResolvedValue(
      makeDetail({ sharedEmail: 'sv@truong.edu.vn', status: 'INTERESTED', threadOpen: true }),
    );
    await renderWithClient(<OfferDetailScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Quan tâm' }));
    await fireEvent.press(
      await screen.findByRole('switch', { name: 'Chia sẻ email của tôi với doanh nghiệp này' }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Bày tỏ quan tâm' }));
    await waitFor(() => expect(interested).toHaveBeenCalledWith('o1', true));
  });

  it('Từ chối khéo: mặc định "Lý do khác", chọn lý do khác được; gửi mã lý do (không có câu tự do)', async () => {
    get.mockResolvedValue(makeDetail());
    decline.mockResolvedValue(
      makeDetail({ declineReason: 'NOT_LOOKING', status: 'DECLINED', threadLocked: true }),
    );
    await renderWithClient(<OfferDetailScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Từ chối khéo' }));
    expect(await screen.findByText(/Doanh nghiệp chỉ thấy lý do bạn chọn/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'Hiện mình chưa tìm việc' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Từ chối lời mời' }));

    await waitFor(() => expect(decline).toHaveBeenCalledWith('o1', 'NOT_LOOKING'));
    expect(
      await screen.findByText(/Bạn đã từ chối lời mời này \(Hiện mình chưa tìm việc\)/),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Từ chối khéo' })).toBeNull();
  });

  it('RECR_009 khi bấm Quan tâm ⇒ tải lại chi tiết, toast "Lời mời đã thay đổi", đóng tấm', async () => {
    get
      .mockResolvedValueOnce(makeDetail())
      .mockResolvedValue(makeDetail({ status: 'WITHDRAWN', threadLocked: true }));
    interested.mockRejectedValue(httpError(409, 'RECR_009'));
    await renderWithClient(<OfferDetailScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Quan tâm' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Bày tỏ quan tâm' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('info', 'Lời mời đã thay đổi'));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Doanh nghiệp đã thu hồi lời mời này.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Bày tỏ quan tâm' })).toBeNull();
  });
});
