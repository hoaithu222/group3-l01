import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Redirect, router } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';

import { wellbeingService } from '../api/wellbeing.service';
import { WellbeingOnboardingScreen } from '../screens/WellbeingOnboardingScreen';
import { WELLBEING_HREF } from '../utils/wellbeing-routes';
import {
  apiError,
  disabledSetting,
  networkError,
  renderWithClient,
  settle,
  setting,
} from './wellbeing.harness';

/**
 * Giải thích + ĐỒNG Ý bật (p7-03 §3): dữ liệu sức khoẻ nên mặc định TẮT, nói rõ trước khi bật (thu thập gì · ai KHÔNG thấy · giữ bao lâu · tắt/xoá), và chỉ bật khi người dùng bấm nút
 * rõ ràng — không bật ngầm khi mở màn, "Để sau" không gọi gì. Offline khoá nút; lỗi không bật ngầm mà báo bằng câu của feature.
 * ⚠️ Mọi điều kiện DƯƠNG đợi bằng `findBy*`/`waitFor` (không đợi theo mili giây): khung chờ → nội dung là một lần đổi cây, bấm vào phần tử của khung chờ là bấm vào không khí.
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
/** Đích của lần `<Redirect>` gần nhất (mock trả `null` nên không có gì để tìm trên màn). */
const redirectedTo = () => jest.mocked(Redirect).mock.calls.at(-1)?.[0]?.href;
const enableButton = () => screen.findByRole('button', { name: 'Đồng ý và bật theo dõi' });

beforeEach(() => {
  jest.clearAllMocks();
  mockConnection.current = 'connected';
  settingSpy.mockResolvedValue(disabledSetting());
});

describe('WellbeingOnboardingScreen', () => {
  it('nói rõ TRƯỚC khi bật: ghi gì, ai KHÔNG thấy, giữ bao lâu, tắt/xoá — và không bật ngầm', async () => {
    await renderWithClient(<WellbeingOnboardingScreen />);

    expect(await screen.findByText(/KHÔNG đọc nội dung/)).toBeOnTheScreen();
    expect(screen.getByText('Chỉ bạn xem được')).toBeOnTheScreen();
    expect(screen.getByText(/đều KHÔNG thấy số liệu hay mức đánh giá/)).toBeOnTheScreen();
    expect(screen.getByText(/tối đa 90 ngày rồi tự xoá/)).toBeOnTheScreen();
    expect(screen.getByText('Tắt và xoá bất cứ lúc nào')).toBeOnTheScreen();
    expect(screen.getByText(/không phải chẩn đoán y tế/)).toBeOnTheScreen();
    expect(screen.getByText(/Mặc định TẮT/)).toBeOnTheScreen();
    await settle();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(Redirect).not.toHaveBeenCalled();
  });

  it('bấm "Đồng ý và bật theo dõi" ⇒ PUT { optIn: true } đúng MỘT lần, rồi sang màn Sức khoẻ', async () => {
    updateSpy.mockResolvedValue(setting());
    await renderWithClient(<WellbeingOnboardingScreen />);

    await fireEvent.press(await enableButton());

    await waitFor(() => expect(redirectedTo()).toBe(WELLBEING_HREF));
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith({ optIn: true });
    expect(showToast).toHaveBeenCalledWith(
      'success',
      expect.stringContaining('tắt bất cứ lúc nào'),
    );
  });

  it('"Để sau" quay lại, KHÔNG gọi PUT', async () => {
    await renderWithClient(<WellbeingOnboardingScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Để sau' }));

    expect(router.back).toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('đã bật rồi (mở lại từ liên kết cũ) ⇒ chuyển sang màn Sức khoẻ, không hỏi lại', async () => {
    settingSpy.mockResolvedValue(setting());
    await renderWithClient(<WellbeingOnboardingScreen />);

    await waitFor(() => expect(redirectedTo()).toBe(WELLBEING_HREF));
    expect(screen.queryByText('Đồng ý và bật theo dõi')).toBeNull();
  });

  it('offline ⇒ khoá nút Bật và nói vì sao (đổi cài đặt mà không tới server thì thiết bị lệch nhau)', async () => {
    mockConnection.current = 'offline';
    await renderWithClient(<WellbeingOnboardingScreen />);

    expect(await enableButton()).toBeDisabled();
    expect(screen.getByText(/cần có mạng để bật theo dõi/)).toBeOnTheScreen();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('bật thất bại ⇒ toast câu của feature, vẫn ở màn giải thích (bấm lại được)', async () => {
    updateSpy.mockRejectedValue(apiError(404, 'CFG_005'));
    await renderWithClient(<WellbeingOnboardingScreen />);

    await fireEvent.press(await enableButton());

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('error', 'Tính năng này hiện chưa khả dụng'),
    );
    expect(await enableButton()).toBeOnTheScreen();
  });

  it('không tải được cài đặt ⇒ khối lỗi có "Thử lại"; thử lại tải lại', async () => {
    settingSpy.mockRejectedValueOnce(networkError());
    await renderWithClient(<WellbeingOnboardingScreen />);

    await fireEvent.press(await screen.findByText('Thử lại'));

    expect(await enableButton()).toBeOnTheScreen();
    expect(settingSpy).toHaveBeenCalledTimes(2);
  });
});
