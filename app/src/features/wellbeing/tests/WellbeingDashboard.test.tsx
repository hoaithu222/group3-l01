import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Redirect, router } from 'expo-router';

import { wellbeingService } from '../api/wellbeing.service';
import { WellbeingDashboardScreen } from '../screens/WellbeingDashboardScreen';
import { WELLBEING_ONBOARDING_HREF, WELLBEING_SETTINGS_HREF } from '../utils/wellbeing-routes';
import {
  apiError,
  assessment,
  daily,
  daysAgo,
  disabledSetting,
  factor,
  history,
  networkError,
  renderWithClient,
  setting,
  yesterday,
} from './wellbeing.harness';

/**
 * Màn Sức khoẻ (p7-03 §3 "Dashboard"): mức bằng CHỮ + câu dịu (KHÔNG điểm số), hoạt động 7/30 ngày có bảng thay thế, điều nhận thấy, gợi ý, thẻ cảnh báo trong màn, và các trạng thái
 * (chưa đủ dữ liệu · chưa bật ⇒ sang màn giải thích · lỗi + Thử lại).
 */
jest.mock('expo-router', () => ({
  Redirect: jest.fn(() => null),
  router: { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));
jest.mock('@/shell/capabilities', () => ({ useFeature: () => true }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const settingSpy = jest.spyOn(wellbeingService, 'setting');
const historySpy = jest.spyOn(wellbeingService, 'history');
const ackSpy = jest.spyOn(wellbeingService, 'ack');
const redirectedTo = () => jest.mocked(Redirect).mock.calls.at(-1)?.[0]?.href;

const twoDays = [
  daily(yesterday()),
  daily(daysAgo(2), { activeMinutes: 120, lateNightMinutes: 40 }),
];

beforeEach(() => {
  jest.clearAllMocks();
  settingSpy.mockResolvedValue(setting({ latest: assessment() }));
  historySpy.mockImplementation((days) => Promise.resolve(history({ dailies: twoDays, days })));
  ackSpy.mockResolvedValue(undefined);
});

describe('WellbeingDashboardScreen — nội dung', () => {
  it('mức bằng CHỮ + câu dịu + điều nhận thấy + gợi ý; KHÔNG có điểm số', async () => {
    await renderWithClient(<WellbeingDashboardScreen />);

    expect(await screen.findByText('Trung bình')).toBeOnTheScreen();
    expect(screen.getByText('Gần đây bạn làm việc khá nhiều')).toBeOnTheScreen();
    expect(
      screen.getByText(/Có buổi bạn làm việc liên tục khoảng 3 giờ 15 phút/),
    ).toBeOnTheScreen();
    expect(screen.getByText('Nghỉ giải lao 10 phút')).toBeOnTheScreen();
    expect(screen.getByText('Gợi ý lúc này')).toBeOnTheScreen();
    expect(screen.queryByText(/\/\s*100|điểm số|riskScore/i)).toBeNull();
  });

  it('chưa đủ dữ liệu ⇒ nói cần thêm vài ngày (không bịa mức "Thấp")', async () => {
    settingSpy.mockResolvedValue(setting({ latest: null }));
    historySpy.mockResolvedValue(history());
    await renderWithClient(<WellbeingDashboardScreen />);

    expect(await screen.findByText('Cần thêm vài ngày dữ liệu để đánh giá')).toBeOnTheScreen();
    expect(await screen.findByText('Chưa có số liệu trong khoảng này')).toBeOnTheScreen();
    expect(screen.queryByText('Thấp')).toBeNull();
  });

  it('nhiều nhân tố: mỗi nhân tố một câu dịu, không nêu điểm cộng', async () => {
    const latest = assessment({
      factors: [
        factor(),
        factor({
          aggregate: 'CONSECUTIVE_DAYS_OVER',
          metric: 'lateNightMinutes',
          ruleId: 'streak',
          value: 3,
        }),
      ],
    });
    settingSpy.mockResolvedValue(setting({ latest }));
    await renderWithClient(<WellbeingDashboardScreen />);

    expect(await screen.findByText('Bạn hoạt động vào khuya 3 ngày liên tiếp')).toBeOnTheScreen();
    expect(screen.queryByText(/\+\s*\d+|điểm/)).toBeNull();
  });
});

describe('WellbeingDashboardScreen — biểu đồ 7/30 ngày và bảng thay thế', () => {
  it('biểu đồ có câu tóm tắt cho trình đọc màn hình; chuyển 30 ngày tải lại đúng tham số', async () => {
    await renderWithClient(<WellbeingDashboardScreen />);

    expect(
      await screen.findByLabelText(
        /Biểu đồ hoạt động 7 ngày: có số liệu 2 ngày, ngày nhiều nhất 3 giờ 20 phút/,
      ),
    ).toBeOnTheScreen();
    expect(historySpy).toHaveBeenLastCalledWith(7);

    await fireEvent.press(screen.getByText('30 ngày'));

    expect(await screen.findByLabelText(/Biểu đồ hoạt động 30 ngày/)).toBeOnTheScreen();
    expect(historySpy).toHaveBeenLastCalledWith(30);
  });

  it('"Xem dạng bảng" ⇒ bảng thay thế đọc từng ngày (ngày thiếu ghi "Chưa có số liệu"); bấm lại về biểu đồ', async () => {
    await renderWithClient(<WellbeingDashboardScreen />);
    await fireEvent.press(await screen.findByText('Xem dạng bảng'));

    expect(screen.getByText('Hoạt động')).toBeOnTheScreen();
    expect(screen.getAllByText('Chưa có số liệu').length).toBeGreaterThan(0);
    expect(
      screen.getByLabelText(/hoạt động 3 giờ 20 phút, trong khung khuya 0 phút/),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText(/Biểu đồ hoạt động/)).toBeNull();

    await fireEvent.press(screen.getByText('Xem dạng biểu đồ'));
    expect(screen.getByLabelText(/Biểu đồ hoạt động 7 ngày/)).toBeOnTheScreen();
  });

  it('lịch sử lỗi ⇒ khối lỗi cạnh biểu đồ + "Thử lại" tải lại; phần mức vẫn hiện', async () => {
    historySpy.mockRejectedValueOnce(networkError());
    await renderWithClient(<WellbeingDashboardScreen />);

    await fireEvent.press(await screen.findByText('Thử lại'));

    expect(await screen.findByLabelText(/Biểu đồ hoạt động 7 ngày/)).toBeOnTheScreen();
    expect(historySpy).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Trung bình')).toBeOnTheScreen();
  });
});

describe('WellbeingDashboardScreen — chưa bật, cảnh báo, điều hướng', () => {
  it('chưa bật ⇒ sang màn giải thích/bật; KHÔNG tải lịch sử', async () => {
    settingSpy.mockResolvedValue(disabledSetting());
    await renderWithClient(<WellbeingDashboardScreen />);

    await waitFor(() => expect(redirectedTo()).toBe(WELLBEING_ONBOARDING_HREF));
    expect(historySpy).not.toHaveBeenCalled();
  });

  it('lịch sử trả WELL_001 (vừa tắt ở máy khác) ⇒ sang màn giải thích', async () => {
    historySpy.mockRejectedValue(apiError(409, 'WELL_001'));
    await renderWithClient(<WellbeingDashboardScreen />);

    await waitFor(() => expect(redirectedTo()).toBe(WELLBEING_ONBOARDING_HREF));
  });

  it('thẻ cảnh báo trong màn: "Đã hiểu" ⇒ ack DISMISS đúng id và thẻ biến mất ngay', async () => {
    // Lần tải đầu còn cảnh báo chờ; sau khi ack, BE không còn trả nó (lượt làm mới sau `onSettled` phải khớp).
    settingSpy
      .mockResolvedValueOnce(
        setting({
          latest: assessment(),
          pendingAlert: { id: 'as1', level: 'MEDIUM', suggestion: 'BREAK' },
        }),
      )
      .mockResolvedValue(setting({ latest: assessment() }));
    await renderWithClient(<WellbeingDashboardScreen />);

    expect(await screen.findByText('Một lời nhắc nhẹ')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Đã hiểu' }));

    await waitFor(() => expect(screen.queryByText('Một lời nhắc nhẹ')).toBeNull());
    expect(ackSpy).toHaveBeenCalledWith('as1', 'DISMISS');
  });

  it('đã tắt "Nhắc nhẹ" ⇒ không hiện thẻ cảnh báo dù còn cảnh báo chờ', async () => {
    settingSpy.mockResolvedValue(
      setting({
        alertsEnabled: false,
        latest: assessment(),
        pendingAlert: { id: 'as1', level: 'MEDIUM', suggestion: 'BREAK' },
      }),
    );
    await renderWithClient(<WellbeingDashboardScreen />);
    await screen.findByText('Trung bình');

    expect(screen.queryByText('Một lời nhắc nhẹ')).toBeNull();
  });

  it('nút Cài đặt mở màn Cài đặt theo dõi', async () => {
    await renderWithClient(<WellbeingDashboardScreen />);
    // Đợi NỘI DUNG (không phải khung chờ): nút ở khung chờ bị tháo khỏi cây ngay khi dữ liệu về, bấm vào nó là bấm vào không khí.
    await screen.findByText('Trung bình');
    await fireEvent.press(screen.getByLabelText('Cài đặt theo dõi sức khoẻ'));

    expect(router.push).toHaveBeenCalledWith(WELLBEING_SETTINGS_HREF);
  });
});
