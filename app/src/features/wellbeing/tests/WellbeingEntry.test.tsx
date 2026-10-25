import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Text } from 'react-native';

import { useCapabilities, useFeature } from '@/shell/capabilities';

import { wellbeingService } from '../api/wellbeing.service';
import { WellbeingMeRow } from '../components/WellbeingMeRow';
import { WellbeingRouteGate } from '../screens/WellbeingRouteGate';
import { WELLBEING_HREF } from '../utils/wellbeing-routes';
import { disabledSetting, renderWithClient, settle, setting } from './wellbeing.harness';

/**
 * Lối vào + hàng rào cờ (p7-03): hàng ở màn Tôi chỉ hiện khi cờ `burnout` BẬT và KHÔNG gọi API (không lộ trạng thái ở màn dễ bị liếc); cờ tắt ⇒ cả nhánh thành "chưa khả dụng"
 * nhưng vẫn còn nút TẮT + XOÁ (BE luôn nhận) và tuyệt đối không gọi API đọc (BE sẽ trả 404).
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));
jest.mock('@/shell/capabilities', () => ({ useCapabilities: jest.fn(), useFeature: jest.fn() }));

const settingSpy = jest.spyOn(wellbeingService, 'setting');
const updateSpy = jest.spyOn(wellbeingService, 'update');
const historySpy = jest.spyOn(wellbeingService, 'history');

const flag = (enabled: boolean) =>
  jest.mocked(useCapabilities).mockReturnValue({
    data: { features: { burnout: { enabled } } },
    isLoading: false,
  } as never);

beforeEach(() => {
  jest.clearAllMocks();
  settingSpy.mockResolvedValue(setting());
});

describe('WellbeingMeRow — hàng ở màn Tôi', () => {
  it('cờ bật: có hàng, KHÔNG hiện trạng thái/mức, KHÔNG gọi API, bấm mở màn Sức khoẻ', async () => {
    jest.mocked(useFeature).mockReturnValue(true);
    await renderWithClient(<WellbeingMeRow />);

    expect(screen.getByText('Sức khoẻ học tập')).toBeOnTheScreen();
    expect(screen.queryByText(/Đang bật|Trung bình|Cao|Thấp/)).toBeNull();
    await fireEvent.press(screen.getByText('Sức khoẻ học tập'));
    expect(router.push).toHaveBeenCalledWith(WELLBEING_HREF);
    await settle();
    expect(settingSpy).not.toHaveBeenCalled();
  });

  it.each([false, undefined])('cờ %s (tắt hoặc chưa biết): KHÔNG hiện hàng', async (value) => {
    jest.mocked(useFeature).mockReturnValue(value);
    await renderWithClient(<WellbeingMeRow />);
    await settle();

    expect(screen.queryByText('Sức khoẻ học tập')).toBeNull();
    expect(settingSpy).not.toHaveBeenCalled();
  });
});

describe('WellbeingRouteGate — cờ burnout', () => {
  it('cờ bật: vẽ nội dung nhánh', async () => {
    flag(true);
    await renderWithClient(
      <WellbeingRouteGate>
        <Text>Nội dung nhánh</Text>
      </WellbeingRouteGate>,
    );

    expect(screen.getByText('Nội dung nhánh')).toBeOnTheScreen();
  });

  it('cờ tắt: "chưa khả dụng", KHÔNG có nội dung nhánh, KHÔNG gọi API đọc', async () => {
    flag(false);
    await renderWithClient(
      <WellbeingRouteGate>
        <Text>Nội dung nhánh</Text>
      </WellbeingRouteGate>,
    );
    await settle();

    expect(screen.getByText('Tính năng này hiện chưa khả dụng')).toBeOnTheScreen();
    expect(screen.queryByText('Nội dung nhánh')).toBeNull();
    expect(settingSpy).not.toHaveBeenCalled();
    expect(historySpy).not.toHaveBeenCalled();
  });

  it('cờ tắt: VẪN tắt + xoá được — PUT { optIn: false } (BE luôn nhận), xác nhận trước, rồi quay lại', async () => {
    flag(false);
    updateSpy.mockResolvedValue(disabledSetting());
    await renderWithClient(
      <WellbeingRouteGate>
        <Text>Nội dung nhánh</Text>
      </WellbeingRouteGate>,
    );

    await fireEvent.press(screen.getByText('Tắt theo dõi và xoá dữ liệu'));
    // Chưa gọi gì cho tới khi xác nhận trong hộp thoại.
    expect(updateSpy).not.toHaveBeenCalled();
    expect(screen.getByText('Tắt theo dõi và xoá dữ liệu?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Tắt và xoá dữ liệu'));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith({ optIn: false });
    expect(settingSpy).not.toHaveBeenCalled();
  });

  it('cờ chưa biết + đang tải lần đầu: khung chờ, không nhấp nháy "chưa khả dụng"', async () => {
    jest.mocked(useCapabilities).mockReturnValue({ data: undefined, isLoading: true } as never);
    await renderWithClient(
      <WellbeingRouteGate>
        <Text>Nội dung nhánh</Text>
      </WellbeingRouteGate>,
    );

    expect(screen.queryByText('Tính năng này hiện chưa khả dụng')).toBeNull();
    expect(screen.queryByText('Nội dung nhánh')).toBeNull();
  });
});
