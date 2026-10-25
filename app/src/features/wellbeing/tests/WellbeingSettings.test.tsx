import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';

import { wellbeingService } from '../api/wellbeing.service';
import { WellbeingSettingsScreen } from '../screens/WellbeingSettingsScreen';
import { WELLBEING_ONBOARDING_HREF } from '../utils/wellbeing-routes';
import {
  apiError,
  assessment,
  disabledSetting,
  networkError,
  renderWithClient,
  setting,
} from './wellbeing.harness';

/**
 * Cài đặt theo dõi (p7-03 §3 "Cài đặt"): tắt = xác nhận rồi mới gọi BE (xoá dữ liệu, không hoàn tác); xoá dữ liệu giữ trạng thái bật; công tắc "Nhắc nhẹ" đi qua `PATCH` (không `optIn`) nên tài khoản
 * đã tắt ở máy khác nhận `WELL_001` và KHÔNG BAO GIỜ bị bật lại (`PUT optIn:true` chỉ có ở màn giải thích); offline khoá mọi điều khiển.
 */
jest.mock('expo-router', () => ({
  Redirect: jest.fn(() => null),
  router: { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));
jest.mock('@/shell/capabilities', () => ({ useFeature: () => true }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
const mockConnection = { current: 'connected' };
jest.mock('@/core/socket', () => ({
  ...jest.requireActual('@/core/socket'),
  useConnectionState: () => mockConnection.current,
}));

const settingSpy = jest.spyOn(wellbeingService, 'setting');
const updateSpy = jest.spyOn(wellbeingService, 'update');
const patchSpy = jest.spyOn(wellbeingService, 'patch');
const deleteSpy = jest.spyOn(wellbeingService, 'deleteData');

const trackingSwitch = () => screen.getByRole('switch', { name: 'Theo dõi sức khoẻ học tập' });
const alertsSwitch = () => screen.getByRole('switch', { name: 'Nhắc nhẹ khi cần nghỉ' });

beforeEach(() => {
  jest.clearAllMocks();
  mockConnection.current = 'connected';
  settingSpy.mockResolvedValue(setting({ latest: assessment() }));
  updateSpy.mockResolvedValue(disabledSetting());
  patchSpy.mockResolvedValue(setting({ alertsEnabled: false }));
  deleteSpy.mockResolvedValue(undefined);
});

describe('WellbeingSettingsScreen — tắt theo dõi', () => {
  it('gạt tắt ⇒ HỎI trước (chưa gọi BE); xác nhận ⇒ PUT { optIn: false } rồi về màn Tôi', async () => {
    await renderWithClient(<WellbeingSettingsScreen />);
    await fireEvent.press(await screen.findByRole('switch', { name: 'Theo dõi sức khoẻ học tập' }));

    expect(screen.getByText('Tắt theo dõi và xoá dữ liệu?')).toBeOnTheScreen();
    expect(updateSpy).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Tắt và xoá dữ liệu' }));

    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith('/me'));
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith({ optIn: false });
    expect(showToast).toHaveBeenCalledWith('success', 'Đã tắt theo dõi và xoá dữ liệu');
  });

  it('"Giữ lại" ⇒ đóng hộp thoại, KHÔNG gọi BE, công tắc vẫn bật', async () => {
    await renderWithClient(<WellbeingSettingsScreen />);
    await fireEvent.press(await screen.findByRole('switch', { name: 'Theo dõi sức khoẻ học tập' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Giữ lại' }));

    expect(updateSpy).not.toHaveBeenCalled();
    expect(trackingSwitch()).toBeChecked();
  });

  it('tắt thất bại ⇒ toast câu của feature, không rời màn', async () => {
    updateSpy.mockRejectedValue(apiError(400, 'WELL_003'));
    await renderWithClient(<WellbeingSettingsScreen />);
    await fireEvent.press(await screen.findByRole('switch', { name: 'Theo dõi sức khoẻ học tập' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Tắt và xoá dữ liệu' }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Chưa thực hiện được'),
      ),
    );
    expect(router.dismissTo).not.toHaveBeenCalled();
  });
});

describe('WellbeingSettingsScreen — xoá dữ liệu, nhắc nhẹ, trạng thái', () => {
  it('xoá dữ liệu ⇒ hỏi (nói rõ vẫn thu thập lại) rồi DELETE; theo dõi vẫn bật', async () => {
    await renderWithClient(<WellbeingSettingsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Xoá dữ liệu đã thu thập' }));

    expect(screen.getByText(/thu thập lại từ bây giờ. Muốn dừng hẳn/)).toBeOnTheScreen();
    expect(deleteSpy).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Xoá dữ liệu' }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('success', 'Đã xoá dữ liệu đã thu thập'),
    );
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(trackingSwitch()).toBeChecked();
  });

  it('tắt "Nhắc nhẹ" ⇒ PATCH { alertsEnabled: false } đúng MỘT lần: không optIn, không PUT, không đọc lại cài đặt', async () => {
    await renderWithClient(<WellbeingSettingsScreen />);
    await screen.findByRole('switch', { name: 'Nhắc nhẹ khi cần nghỉ' });
    const before = settingSpy.mock.calls.length;

    await fireEvent.press(alertsSwitch());

    await waitFor(() => expect(patchSpy).toHaveBeenCalledWith({ alertsEnabled: false }));
    await waitFor(() => expect(alertsSwitch()).not.toBeChecked());
    expect(patchSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(settingSpy.mock.calls.length).toBe(before);
  });

  it('⛔ đã tắt ở máy khác ⇒ PATCH bị WELL_001: đọc trạng thái thật MỘT lần, về trạng thái tắt, KHÔNG BAO GIỜ gọi update (không bật lại)', async () => {
    patchSpy.mockRejectedValue(apiError(409, 'WELL_001'));
    await renderWithClient(<WellbeingSettingsScreen />);
    await screen.findByRole('switch', { name: 'Nhắc nhẹ khi cần nghỉ' });
    const before = settingSpy.mock.calls.length;
    settingSpy.mockResolvedValue(disabledSetting());

    await fireEvent.press(alertsSwitch());

    expect(await screen.findByText('Theo dõi đang tắt')).toBeOnTheScreen();
    expect(settingSpy.mock.calls.length).toBe(before + 1);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('info', 'Theo dõi đã được tắt ở thiết bị khác');
  });

  it('PATCH lỗi khác (mất mạng) ⇒ công tắc TRẢ LẠI giá trị cũ + toast, không đọc lại, không PUT', async () => {
    patchSpy.mockRejectedValue(networkError());
    await renderWithClient(<WellbeingSettingsScreen />);
    await screen.findByRole('switch', { name: 'Nhắc nhẹ khi cần nghỉ' });
    const before = settingSpy.mock.calls.length;

    await fireEvent.press(alertsSwitch());

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('error', expect.any(String)));
    await waitFor(() => expect(alertsSwitch()).toBeChecked());
    expect(settingSpy.mock.calls.length).toBe(before);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('đang tắt (mở bằng liên kết cũ) ⇒ trạng thái "đang tắt" + đường bật lại, không có nút xoá', async () => {
    settingSpy.mockResolvedValue(disabledSetting());
    await renderWithClient(<WellbeingSettingsScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Xem giải thích và bật' }));

    expect(router.replace).toHaveBeenCalledWith(WELLBEING_ONBOARDING_HREF);
    expect(screen.queryByText('Xoá dữ liệu đã thu thập')).toBeNull();
  });

  it('offline ⇒ khoá công tắc và nút xoá, nói vì sao; nhắc lại quyền riêng tư ở cuối màn', async () => {
    mockConnection.current = 'offline';
    await renderWithClient(<WellbeingSettingsScreen />);
    await screen.findByRole('switch', { name: 'Theo dõi sức khoẻ học tập' });

    expect(trackingSwitch()).toBeDisabled();
    expect(alertsSwitch()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Xoá dữ liệu đã thu thập' })).toBeDisabled();
    expect(screen.getByText(/cần có mạng để đổi cài đặt/)).toBeOnTheScreen();
    expect(screen.getByText('Chỉ bạn xem được')).toBeOnTheScreen();
  });
});
