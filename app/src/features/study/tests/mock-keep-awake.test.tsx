import { act, fireEvent, screen } from '@testing-library/react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { useConnectionState } from '@/core/socket';

import { mockAttemptsService } from '../api/mock-attempts.service';
import { MOCK_KEEP_AWAKE_TAG } from '../hooks/useMockKeepAwake';
import { MockTestPlayerScreen } from '../screens/MockTestPlayerScreen';
import { useMockPlayerStore } from '../store/mock-player.store';
import { AUTOSAVE_DEBOUNCE_MS } from '../utils/answer-batches';
import { makeInProgress, makeResult } from './mock-fixtures';
import { apiError, renderWithProviders } from './render-helpers';

/** p4-02 app.md §6: giữ màn sáng suốt lúc làm bài thi thử; hết giờ/đã nộp/rời màn thì nhả (không giữ sáng lâu hơn cần thiết). */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ attemptId: 'a1' })),
}));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/core/socket', () => ({ useConnectionState: jest.fn(() => 'connected') }));
jest.mock('../api/mock-attempts.service', () => ({
  ...jest.requireActual('../api/mock-attempts.service'),
  mockAttemptsService: {
    get: jest.fn(),
    putAnswers: jest.fn(),
    recordEvent: jest.fn(),
    submit: jest.fn(),
  },
}));

const api = jest.mocked(mockAttemptsService);
const advance = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.mocked(useConnectionState).mockReturnValue('connected');
  useMockPlayerStore.setState({ attempts: {} });
  api.get.mockResolvedValue(makeInProgress());
  api.putAnswers.mockResolvedValue({ answeredCount: 1, serverNow: new Date().toISOString() });
  api.submit.mockResolvedValue(makeResult());
});
afterEach(() => jest.useRealTimers());

describe('thi thử — giữ màn hình sáng', () => {
  it('đang làm bài ⇒ giữ sáng; rời màn (gỡ) ⇒ nhả đúng tag', async () => {
    const { unmount } = await renderWithProviders(<MockTestPlayerScreen />);
    await screen.findByText('Câu hỏi số 1?');

    expect(activateKeepAwakeAsync).toHaveBeenCalledWith(MOCK_KEEP_AWAKE_TAG);
    expect(deactivateKeepAwake).not.toHaveBeenCalled();

    await unmount();
    expect(deactivateKeepAwake).toHaveBeenCalledWith(MOCK_KEEP_AWAKE_TAG);
  });

  it('hết giờ (BE trả MOCK_003) ⇒ nhả NGAY dù màn còn đó chờ sang kết quả', async () => {
    api.putAnswers.mockRejectedValue(apiError(409, 'MOCK_003'));
    await renderWithProviders(<MockTestPlayerScreen />);
    await fireEvent.press(await screen.findByText('Đáp án A1'));
    expect(deactivateKeepAwake).not.toHaveBeenCalled();

    await advance(AUTOSAVE_DEBOUNCE_MS);
    expect(await screen.findByText('Đã hết giờ — đang lấy kết quả')).toBeOnTheScreen();
    expect(deactivateKeepAwake).toHaveBeenCalledWith(MOCK_KEEP_AWAKE_TAG);
  });
});
