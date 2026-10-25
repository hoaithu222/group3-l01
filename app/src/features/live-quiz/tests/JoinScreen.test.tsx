import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { liveQuizService } from '../api/live-quiz.service';
import { JoinScreen } from '../screens/JoinScreen';

/**
 * app.md p5-01 §1/§3: deep link `superapp://live/{pin}` → `join?pin=` điền sẵn PIN; đổi mã khi màn đã mở thì điền lại;
 * lỗi `QUIZ_*` hiện TẠI trường PIN.
 */

const mockParams: { current: { pin?: string } } = { current: {} };
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockParams.current,
}));

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

const joinSpy = jest.spyOn(liveQuizService, 'join');

function tree(): ReactElement {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { gcTime: 0 }, queries: { gcTime: Infinity, retry: false } },
  });
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>
        <JoinScreen />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const joinButton = () => screen.getByRole('button', { name: 'Vào phòng' });

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.current = {};
});

it('không có ?pin ⇒ nút "Vào phòng" khoá', async () => {
  await render(tree());

  expect(joinButton()).toBeDisabled();
});

it('`?pin=123456` (deep link) ⇒ PIN điền sẵn — nút mở khoá; bấm ⇒ POST /join đúng mã rồi vào phòng', async () => {
  mockParams.current = { pin: '123456' };
  joinSpy.mockResolvedValue({ sessionId: 's42', snapshot: {} as never });
  await render(tree());

  expect(joinButton()).toBeEnabled();
  await fireEvent.press(joinButton());

  await waitFor(() => expect(joinSpy).toHaveBeenCalledWith({ nickname: undefined, pin: '123456' }));
  await waitFor(() =>
    expect(router.replace).toHaveBeenCalledWith({
      params: { sessionId: 's42' },
      pathname: '/study/live/[sessionId]',
    }),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
});

it('`?pin` thiếu số / có ký tự lạ ⇒ chỉ điền phần chữ số hợp lệ, nút vẫn khoá', async () => {
  mockParams.current = { pin: '12-34' };
  await render(tree());

  expect(joinButton()).toBeDisabled();
});

it('deep link thứ hai đến KHI màn đã mở ⇒ điền lại theo mã mới', async () => {
  const view = await render(tree());
  expect(joinButton()).toBeDisabled();

  mockParams.current = { pin: '654321' };
  await view.rerender(tree());

  expect(joinButton()).toBeEnabled();
});

it('PIN sai ⇒ `QUIZ_001` hiện tại trường PIN (không toast), sửa PIN thì xoá lỗi', async () => {
  mockParams.current = { pin: '111111' };
  joinSpy.mockRejectedValue({
    isAxiosError: true,
    response: { data: { error: { code: 'QUIZ_001' } }, status: 404 },
  });
  await render(tree());

  await fireEvent.press(joinButton());

  expect(await screen.findByText('Mã PIN không đúng hoặc đã hết hạn')).toBeOnTheScreen();
  // Bấm ⇒ rung nhẹ xác nhận; mã bị từ chối ⇒ rung CẢNH BÁO (không phải rung lỗi nặng, không cho lỗi mạng).
  expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Warning);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
});

it('mất mạng khi vào phòng ⇒ KHÔNG rung cảnh báo (không phải người dùng nhập sai mã)', async () => {
  mockParams.current = { pin: '111111' };
  joinSpy.mockRejectedValue(Object.assign(new Error('Network Error'), { isAxiosError: true }));
  await render(tree());

  await fireEvent.press(joinButton());

  await waitFor(() => expect(joinSpy).toHaveBeenCalledTimes(1));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(Haptics.notificationAsync).not.toHaveBeenCalled();
});

it('"Lịch sử thi của tôi" là icon trên thanh tiêu đề (không còn nút chữ trôi giữa form) và mở màn lịch sử', async () => {
  await render(tree());

  expect(screen.queryByText('Lịch sử thi của tôi')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Lịch sử thi của tôi' }));

  expect(router.push).toHaveBeenCalledWith('/study/live/history');
});
