import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { LiveQuizSnapshot } from '../api/live-quiz.types';
import { useLiveQuizSession } from '../hooks/useLiveQuizSession';
import { SessionScreen } from '../screens/SessionScreen';
import { snapshot } from './session-harness';

/**
 * Bố cục thanh đáy của CHỦ PHÒNG (app.md p5-01 §3): chỉ MỘT nút — bước kế tiếp của phiên. "Huỷ phòng"/"Kết thúc phiên"
 * là thao tác phá huỷ với mọi người chơi ⇒ nằm trong menu "⋯" của thanh tiêu đề và luôn qua hộp thoại xác nhận.
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ sessionId: 's1' }),
}));
jest.mock('../hooks/useLiveQuizSession', () => ({ useLiveQuizSession: jest.fn() }));
jest.mock('../hooks/useKeepScreenAwake', () => ({ useKeepScreenAwake: jest.fn() }));

const mockMutate = jest.fn();
jest.mock('../queries/live-quiz.queries', () => ({
  useHostCommand: () => ({ isPending: false, mutate: mockMutate }),
  useKickPlayer: () => ({ isPending: false, mutate: jest.fn(), variables: undefined }),
}));

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function mockSession(data: LiveQuizSnapshot): void {
  jest.mocked(useLiveQuizSession).mockReturnValue({
    offsetMs: 0,
    room: { status: 'joined' },
    snapshot: { data, isError: false, isLoading: false, isRefetching: false, refetch: jest.fn() },
  } as never);
}

const tree = (): ReactElement => (
  <SafeAreaProvider initialMetrics={METRICS}>
    <SessionScreen />
  </SafeAreaProvider>
);

beforeEach(() => jest.clearAllMocks());

describe('SessionScreen — chủ phòng', () => {
  it('sảnh chờ: thanh đáy chỉ có "Bắt đầu"; "Huỷ phòng" ẩn trong menu và phải xác nhận mới chạy', async () => {
    mockSession(snapshot({ phase: 'LOBBY', pin: '123456' }));
    await render(tree());

    expect(screen.getByRole('button', { name: 'Bắt đầu' })).toBeOnTheScreen();
    expect(screen.queryByText('Huỷ phòng')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Tuỳ chọn phòng thi'));
    await fireEvent.press(await screen.findByText('Huỷ phòng'));
    expect(await screen.findByText('Huỷ phòng thi?')).toBeOnTheScreen();
    expect(mockMutate).not.toHaveBeenCalled();

    await fireEvent.press(screen.getAllByText('Huỷ phòng').at(-1) as never);
    await waitFor(() =>
      expect(mockMutate).toHaveBeenCalledWith(
        { command: 'cancel', expectedVersion: 1 },
        expect.anything(),
      ),
    );
  });

  it('đang thi: nút chính là "Kết thúc câu"; "Kết thúc phiên" chỉ có trong menu và hỏi lại', async () => {
    mockSession(snapshot({ phase: 'REVEAL', pin: '123456' }));
    await render(tree());

    expect(screen.getByRole('button', { name: 'Câu tiếp theo' })).toBeOnTheScreen();
    expect(screen.queryByText('Kết thúc phiên')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Tuỳ chọn phòng thi'));
    await fireEvent.press(await screen.findByText('Kết thúc phiên'));
    expect(await screen.findByText('Kết thúc phiên thi?')).toBeOnTheScreen();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('người chơi (không có PIN) không có menu huỷ/kết thúc', async () => {
    mockSession(snapshot({ phase: 'LOBBY' }));
    await render(tree());

    expect(screen.queryByLabelText('Tuỳ chọn phòng thi')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bắt đầu' })).toBeNull();
  });
});
