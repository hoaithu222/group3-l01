import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { pomodoroService } from '../api/pomodoro.service';
import { pomodoroKeys } from '../api/pomodoro.keys';
import type { PomodoroSnapshot } from '../api/pomodoro.types';
import { GoalSheet } from '../components/GoalSheet';
import { PomodoroConfigSheet } from '../components/PomodoroConfigSheet';
import { usePomodoroStore } from '../store/pomodoro.store';
import { apiErrorLike, makeSnapshot, ME_ID, NO_ACTIONS } from './fixtures';
import { makeQueryClient, renderWithProviders } from './helpers';

jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }) }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

/**
 * Tấm cấu hình: 4 bộ tăng/giảm + công tắc, lỗi `CALL_POMO_003` hiện trong tấm, ngoại tuyến khoá lưu. Tấm mục tiêu: đếm GRAPHEME tới 200, giữ nháp trong store,
 * lỗi tại ô, chia sẻ với phòng.
 */

const configSpy = jest.spyOn(pomodoroService, 'updateConfig');
const goalSpy = jest.spyOn(pomodoroService, 'setGoal');

const waiting = (over: Partial<PomodoroSnapshot> = {}) =>
  makeSnapshot({ hostUserId: ME_ID, myActions: { ...NO_ACTIONS, canConfigure: true }, sessionId: 's1', version: 4, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  usePomodoroStore.getState().reset();
});

describe('PomodoroConfigSheet', () => {
  const mount = (snapshot = waiting(), offline = false, onClose = jest.fn()) =>
    renderWithProviders(<PomodoroConfigSheet channelId="ch1" offline={offline} snapshot={snapshot} visible onClose={onClose} />, makeQueryClient());

  it('hiện cấu hình hiện tại; lưu gửi đủ 4 số + expectedVersion của phiên, rồi đóng và ghi cache', async () => {
    const onClose = jest.fn();
    configSpy.mockResolvedValue(waiting({ config: { ...makeSnapshot().config, focusMinutes: 30 }, version: 4 }));
    const view = await mount(waiting(), false, onClose);

    expect(await screen.findByText('Tập trung (phút)')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tăng tập trung (phút)' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Lưu cấu hình' }));

    await waitFor(() => expect(configSpy).toHaveBeenCalledTimes(1));
    expect(configSpy).toHaveBeenCalledWith('ch1', expect.objectContaining({ autoAdvance: true, cyclesBeforeLongBreak: 4, expectedVersion: 4, focusMinutes: 30, longBreakMinutes: 15, shortBreakMinutes: 5 }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(view.queryClient.getQueryData<PomodoroSnapshot>(pomodoroKeys.snapshot('ch1'))?.config.focusMinutes).toBe(30);
  });

  it('kênh CHƯA có phiên: không gửi expectedVersion (lưu làm mặc định của kênh)', async () => {
    configSpy.mockResolvedValue(makeSnapshot());
    await mount(makeSnapshot({ myActions: { ...NO_ACTIONS, canConfigure: true } }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Lưu cấu hình' }));
    await waitFor(() => expect(configSpy).toHaveBeenCalled());
    expect(configSpy.mock.calls[0]?.[1].expectedVersion).toBeUndefined();
  });

  it('phiên đã bắt đầu (CALL_POMO_003) ⇒ lỗi hiện NGAY trong tấm, tấm vẫn mở', async () => {
    configSpy.mockRejectedValue(apiErrorLike(409, 'CALL_POMO_003'));
    const onClose = jest.fn();
    await mount(waiting(), false, onClose);

    await fireEvent.press(await screen.findByRole('button', { name: 'Lưu cấu hình' }));

    expect(await screen.findByText('Chỉ đổi cấu hình khi phiên chưa bắt đầu')).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ngoại tuyến ⇒ nút lưu khoá và đổi nhãn', async () => {
    await mount(waiting(), true);
    expect(await screen.findByRole('button', { name: 'Kết nối lại để lưu' })).toBeDisabled();
  });
});

describe('GoalSheet', () => {
  const mount = (snapshot = waiting({ myGoal: null }), onClose = jest.fn()) =>
    renderWithProviders(<GoalSheet channelId="ch1" offline={false} snapshot={snapshot} visible onClose={onClose} />, makeQueryClient());

  it('đếm ký tự; nháp nằm trong store nên đóng/mở lại không mất chữ', async () => {
    const view = await mount();
    await fireEvent.changeText(await screen.findByLabelText('Mục tiêu'), 'Xong chương 3');
    expect(screen.getByText('13/200')).toBeOnTheScreen();
    expect(usePomodoroStore.getState().goalDraft.s1).toBe('Xong chương 3');

    await view.unmount();
    await mount();
    expect(await screen.findByDisplayValue('Xong chương 3')).toBeOnTheScreen();
  });

  it('quá 200 ký tự ⇒ lỗi tại ô và khoá nút lưu', async () => {
    await mount();
    await fireEvent.changeText(await screen.findByLabelText('Mục tiêu'), 'a'.repeat(201));
    expect(screen.getByText('Tối đa 200 ký tự')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lưu mục tiêu' })).toBeDisabled();
  });

  it('lưu gửi chữ đã cắt khoảng trắng + cờ chia sẻ, cập nhật myGoal trong cache, xoá nháp và đóng', async () => {
    const onClose = jest.fn();
    goalSpy.mockResolvedValue({ goal: 'Xong chương 3', shared: true });
    const view = await mount(waiting({ myGoal: null }), onClose);
    view.queryClient.setQueryData(pomodoroKeys.snapshot('ch1'), waiting({ myGoal: null }));

    await fireEvent.changeText(await screen.findByLabelText('Mục tiêu'), '  Xong chương 3  ');
    await fireEvent.press(screen.getByLabelText('Chia sẻ với phòng'));
    await fireEvent.press(screen.getByRole('button', { name: 'Lưu mục tiêu' }));

    await waitFor(() => expect(goalSpy).toHaveBeenCalledWith('ch1', { shared: true, text: 'Xong chương 3' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(view.queryClient.getQueryData<PomodoroSnapshot>(pomodoroKeys.snapshot('ch1'))?.myGoal).toEqual({ shared: true, text: 'Xong chương 3' });
    expect(usePomodoroStore.getState().goalDraft).toEqual({});
  });

  it('CALL_POMO_006 (chưa vào phòng) ⇒ lỗi tại ô', async () => {
    goalSpy.mockRejectedValue(apiErrorLike(409, 'CALL_POMO_006'));
    await mount();
    await fireEvent.changeText(await screen.findByLabelText('Mục tiêu'), 'Xong bài');
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Lưu mục tiêu' }));
    });
    expect(await screen.findByText('Hãy vào phòng trước khi đặt mục tiêu')).toBeOnTheScreen();
  });
});
