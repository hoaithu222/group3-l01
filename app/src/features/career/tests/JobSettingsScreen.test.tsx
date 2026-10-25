import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';

import { jobSettingsService } from '../api/career-settings.service';
import { careerService } from '../api/career.service';
import { JobSettingsScreen } from '../screens/jobs/JobSettingsScreen';
import { httpError, makeSettings, renderWithClient } from './jobs-fixtures';
import { resetSocketMock, setConnection } from './socket-mock';

/**
 * app.md p6-08 §8 (RNTL): bật Open to work lần đầu mở `CareerConsentSheet`, không tick ⇒ không gửi; đồng ý ⇒ `PUT` kèm `consentVersion`; TẮT lạc quan + trả lại
 * khi lỗi; lưu hồ sơ gửi ĐỦ trường; bảng tin tắt ⇒ chỉ tắt được.
 */
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/core/socket', () => jest.requireActual('./socket-mock'));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const get = jest.spyOn(jobSettingsService, 'get');
const update = jest.spyOn(jobSettingsService, 'update');
jest.spyOn(careerService, 'mySkills').mockResolvedValue([]);

const TOGGLE = { name: 'Cho doanh nghiệp tìm thấy tôi' };

beforeEach(() => {
  jest.clearAllMocks();
  resetSocketMock();
});

describe('JobSettingsScreen — Open to work + đồng ý chính sách', () => {
  it('bật lần đầu mở tấm đồng ý; chưa tick thì nút khoá và KHÔNG gửi; tick rồi đồng ý ⇒ PUT kèm consentVersion hiện hành', async () => {
    get.mockResolvedValue(makeSettings());
    update.mockResolvedValue(makeSettings({ consentVersion: 'v1', openToWork: true }));
    await renderWithClient(<JobSettingsScreen />);

    await fireEvent.press(await screen.findByRole('switch', TOGGLE));
    expect(await screen.findByText('Cho doanh nghiệp tìm thấy bạn')).toBeOnTheScreen();
    expect(screen.getByText(/Tắt là biến mất ngay/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Đồng ý và bật' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Đồng ý và bật' }));
    expect(update).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('checkbox', { name: /Tôi đã đọc và đồng ý/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Đồng ý và bật' }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith({
      consentVersion: 'v1',
      headline: null,
      location: null,
      openToWork: true,
      preferredRoles: [],
    });
    await waitFor(() => expect(screen.getByRole('switch', TOGGLE)).toBeChecked());
  });

  it('đã đồng ý đúng phiên bản hiện hành ⇒ bật thẳng, không hỏi lại; chính sách đổi ⇒ hỏi lại kèm lời báo', async () => {
    get.mockResolvedValue(makeSettings({ consentVersion: 'v1' }));
    update.mockResolvedValue(makeSettings({ consentVersion: 'v1', openToWork: true }));
    const { screen: view } = await renderWithClient(<JobSettingsScreen />);
    await fireEvent.press(await screen.findByRole('switch', TOGGLE));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ consentVersion: 'v1', openToWork: true }),
      ),
    );
    expect(screen.queryByText('Cho doanh nghiệp tìm thấy bạn')).toBeNull();
    await view.unmount();

    get.mockResolvedValue(makeSettings({ consentVersion: 'v0', requiredConsentVersion: 'v2' }));
    await renderWithClient(<JobSettingsScreen />);
    await fireEvent.press(await screen.findByRole('switch', TOGGLE));
    expect(await screen.findByText(/Chính sách dữ liệu đã được cập nhật/)).toBeOnTheScreen();
  });

  it('TẮT là lạc quan: công tắc tắt ngay khi chờ server; server lỗi ⇒ bật lại + toast', async () => {
    get.mockResolvedValue(makeSettings({ consentVersion: 'v1', openToWork: true }));
    let fail: (error: Error) => void = () => undefined;
    update.mockReturnValue(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    await renderWithClient(<JobSettingsScreen />);

    await waitFor(() => expect(screen.getByRole('switch', TOGGLE)).toBeChecked());
    await fireEvent.press(screen.getByRole('switch', TOGGLE));
    await waitFor(() => expect(screen.getByRole('switch', TOGGLE)).not.toBeChecked());
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ openToWork: false }));

    await act(async () => fail(httpError(500, 'SYS_500')));
    await waitFor(() => expect(screen.getByRole('switch', TOGGLE)).toBeChecked());
    expect(showToast).toHaveBeenCalledWith('error', expect.any(String));
  });

  it('lưu hồ sơ gửi ĐỦ trường (tiêu đề đã cắt khoảng trắng, khu vực, vị trí); để trống ⇒ null', async () => {
    get.mockResolvedValue(makeSettings({ consentVersion: 'v1' }));
    update.mockResolvedValue(
      makeSettings({ headline: 'Sinh viên năm 4', preferredRoles: ['Frontend'] }),
    );
    await renderWithClient(<JobSettingsScreen />);

    await fireEvent.changeText(await screen.findByLabelText(/Tiêu đề/), '  Sinh viên năm 4  ');
    await fireEvent.changeText(screen.getByLabelText(/Vị trí mong muốn/), 'Frontend');
    await fireEvent.press(screen.getByRole('button', { name: 'Thêm' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith({
      headline: 'Sinh viên năm 4',
      location: null,
      openToWork: false,
      preferredRoles: ['Frontend'],
    });
  });

  it('bảng tin nhà tuyển dụng tắt và chưa bật ⇒ công tắc khoá kèm giải thích; offline ⇒ khoá công tắc và nút Lưu', async () => {
    get.mockResolvedValue(makeSettings({ recruiterEnabled: false }));
    const { screen: view } = await renderWithClient(<JobSettingsScreen />);
    expect(await screen.findByText(/Bảng tin nhà tuyển dụng đang tạm tắt/)).toBeOnTheScreen();
    expect(screen.getByRole('switch', TOGGLE)).toBeDisabled();
    await view.unmount();

    get.mockResolvedValue(makeSettings());
    setConnection('offline');
    await renderWithClient(<JobSettingsScreen />);
    expect(await screen.findByText('Cần có mạng để đổi cài đặt này.')).toBeOnTheScreen();
    expect(screen.getByRole('switch', TOGGLE)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled();
  });

  it('xem trước nói rõ cái KHÔNG hiện; lối tắt mở hộp thư lời mời; 404 cờ tắt ⇒ "Chưa khả dụng"', async () => {
    get.mockResolvedValue(
      makeSettings({ headline: 'Sinh viên năm 4', preferredRoles: ['Backend'] }),
    );
    const { screen: view } = await renderWithClient(<JobSettingsScreen />);
    expect(
      await screen.findByText('Không hiển thị email, số điện thoại, tên nhóm.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Điểm đóng góp: đang ẩn.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Lời mời đã nhận'));
    expect(router.push).toHaveBeenCalledWith('/me/career/offers');
    await view.unmount();

    get.mockRejectedValue(httpError(404, 'CFG_005'));
    await renderWithClient(<JobSettingsScreen />);
    expect(await screen.findByText('Chưa khả dụng')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });
});
