import type { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, usePathname } from 'expo-router';

import { useFeature } from '@/shell/capabilities';
import { showToast } from '@/shared/utils/toast.utils';

import { wellbeingService } from '../api/wellbeing.service';
import type { PendingAlert } from '../api/wellbeing.types';
import { WellbeingAlertHost } from '../components/WellbeingAlertHost';
import { WELLBEING_ALERT_EVENT } from '../constants/wellbeing.constants';
import { wellbeingKeys } from '../queries/wellbeing.keys';
import { WELLBEING_HREF } from '../utils/wellbeing-routes';
import { mockSocket, networkError, renderWithClient, settle, setting } from './wellbeing.harness';

/**
 * Thẻ cảnh báo MỀM toàn cục (p7-03 §2/§7, WELL-05): hiện từ `pendingAlert` (mở app) + socket; lời chỉ nói gợi ý — KHÔNG mức, KHÔNG số; hoãn khi đang thi/gọi/họp/live quiz và ở chính nhánh
 * Sức khoẻ; "Đã hiểu"/"Nhắc lại sau" gọi ack đúng id; ✕ chỉ ẩn trong phiên; cờ tắt ⇒ im hoàn toàn (không gọi API, không nghe socket).
 */
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, usePathname: jest.fn() }));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn() }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const settingSpy = jest.spyOn(wellbeingService, 'setting');
const ackSpy = jest.spyOn(wellbeingService, 'ack');
const pending: PendingAlert = { id: 'as1', level: 'HIGH', suggestion: 'BREAK' };
const CARD = 'Một lời nhắc nhẹ';
/** Đợi cài đặt ĐÃ về cache — không thì các khẳng định "không hiện thẻ" đúng vì chưa tải xong chứ không vì logic. */
const loaded = (client: QueryClient) =>
  waitFor(() => expect(client.getQueryData(wellbeingKeys.setting())).toBeDefined());

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useFeature).mockReturnValue(true);
  jest.mocked(usePathname).mockReturnValue('/');
  settingSpy.mockResolvedValue(setting({ pendingAlert: pending }));
  ackSpy.mockResolvedValue(undefined);
});

// Xả việc React Query còn treo (làm mới sau ack…) TRONG `act` trước khi test kết thúc — không thì cập nhật đến muộn và React báo "not wrapped in act".
afterEach(() => settle());

describe('WellbeingAlertHost — hiện thẻ', () => {
  it('mở app có cảnh báo chờ ⇒ thẻ dịu theo gợi ý, KHÔNG nêu mức/điểm', async () => {
    await renderWithClient(<WellbeingAlertHost />);

    expect(await screen.findByText(CARD)).toBeOnTheScreen();
    expect(
      screen.getByText('Bạn đã làm việc liên tục khá lâu. Nghỉ ngắn một chút nhé.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/Cao|Trung bình|Thấp|HIGH|MEDIUM|điểm|\/100/)).toBeNull();
  });

  it('socket wellbeing:alert ⇒ hiện thẻ (BE là nguồn thật: làm mới cài đặt theo sau)', async () => {
    settingSpy
      .mockResolvedValueOnce(setting())
      .mockResolvedValue(setting({ pendingAlert: pending }));
    const { client } = await renderWithClient(<WellbeingAlertHost />);
    await loaded(client);
    expect(screen.queryByText(CARD)).toBeNull();

    await act(async () => {
      mockSocket.__emitServer(WELLBEING_ALERT_EVENT, {
        assessmentId: 'as1',
        level: 'HIGH',
        serverNow: 1,
        suggestion: 'BREAK',
        v: 1,
      });
    });

    expect(await screen.findByText(CARD)).toBeOnTheScreen();
  });

  it('payload lạ/hỏng ⇒ bỏ qua, không làm mới, không thẻ', async () => {
    settingSpy.mockResolvedValue(setting());
    const { client } = await renderWithClient(<WellbeingAlertHost />);
    await loaded(client);
    const calls = settingSpy.mock.calls.length;

    await act(async () => {
      mockSocket.__emitServer(WELLBEING_ALERT_EVENT, { assessmentId: 'as1', level: 'LOW', v: 1 });
      mockSocket.__emitServer(WELLBEING_ALERT_EVENT, 'hỏng');
    });
    await settle();

    expect(settingSpy.mock.calls.length).toBe(calls);
    expect(screen.queryByText(CARD)).toBeNull();
  });

  it('đã tắt "Nhắc nhẹ" ⇒ không hiện dù còn cảnh báo chờ', async () => {
    settingSpy.mockResolvedValue(setting({ alertsEnabled: false, pendingAlert: pending }));
    const { client } = await renderWithClient(<WellbeingAlertHost />);
    await loaded(client);

    expect(screen.queryByText(CARD)).toBeNull();
  });

  it('cờ burnout tắt ⇒ im hoàn toàn: không gọi API, không thẻ, bỏ qua sự kiện socket', async () => {
    jest.mocked(useFeature).mockReturnValue(false);
    await renderWithClient(<WellbeingAlertHost />);
    await act(async () => {
      mockSocket.__emitServer(WELLBEING_ALERT_EVENT, { assessmentId: 'as1', level: 'HIGH', v: 1 });
    });
    await settle();

    expect(settingSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(CARD)).toBeNull();
  });

  it.each([
    '/study/attempts/abc',
    '/call/xyz',
    '/meetings/m1/room',
    '/study/live/q1',
    '/me/wellbeing',
  ])('đang ở %s ⇒ HOÃN thẻ (vẫn chờ ở BE)', async (path) => {
    jest.mocked(usePathname).mockReturnValue(path);
    const { client } = await renderWithClient(<WellbeingAlertHost />);
    await loaded(client);

    expect(screen.queryByText(CARD)).toBeNull();
  });
});

describe('WellbeingAlertHost — hành động', () => {
  it('"Đã hiểu" ⇒ ack DISMISS đúng id; thẻ biến mất', async () => {
    settingSpy
      .mockResolvedValueOnce(setting({ pendingAlert: pending }))
      .mockResolvedValue(setting());
    await renderWithClient(<WellbeingAlertHost />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Đã hiểu' }));

    await waitFor(() => expect(screen.queryByText(CARD)).toBeNull());
    expect(ackSpy).toHaveBeenCalledWith('as1', 'DISMISS');
  });

  it('"Nhắc lại sau" ⇒ ack SNOOZE + nói đúng điều BE làm (hoãn 24 giờ)', async () => {
    settingSpy
      .mockResolvedValueOnce(setting({ pendingAlert: pending }))
      .mockResolvedValue(setting());
    await renderWithClient(<WellbeingAlertHost />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Nhắc lại sau' }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('info', 'Mình sẽ chưa nhắc bạn trong 24 giờ tới'),
    );
    expect(ackSpy).toHaveBeenCalledWith('as1', 'SNOOZE');
  });

  it('ack lỗi ⇒ thẻ hiện lại + toast (không mất cảnh báo vì mất mạng)', async () => {
    ackSpy.mockRejectedValue(networkError());
    await renderWithClient(<WellbeingAlertHost />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Đã hiểu' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('error', expect.any(String)));
    expect(await screen.findByText(CARD)).toBeOnTheScreen();
  });

  it('✕ chỉ ẨN trong phiên: KHÔNG ack; "Xem chi tiết" mở màn Sức khoẻ', async () => {
    await renderWithClient(<WellbeingAlertHost />);
    await fireEvent.press(await screen.findByText('Xem chi tiết'));
    expect(router.push).toHaveBeenCalledWith(WELLBEING_HREF);

    await fireEvent.press(screen.getByRole('button', { name: 'Đóng thông báo' }));

    expect(screen.queryByText(CARD)).toBeNull();
    expect(ackSpy).not.toHaveBeenCalled();
  });
});
