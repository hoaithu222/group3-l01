import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { mockAttemptsService } from '../api/mock-attempts.service';
import { useAttemptAppStateEvents } from '../hooks/useAttemptAppStateEvents';
import { useMockAttempt } from '../queries/mock-attempts.queries';
import { useMockPlayerStore } from '../store/mock-player.store';
import { makeInProgress } from './mock-fixtures';
import { makeQueryClient } from './render-helpers';

/** Rời/vào app lúc đang thi (README p4-02 §4 "Rời app"): sự kiện bền qua hàng đợi, gửi bù đúng thứ tự, FOREGROUND làm mới `detail`. */
jest.mock('@/core/socket', () => ({ useConnectionState: jest.fn(() => 'connected') }));
jest.mock('../api/mock-attempts.service', () => ({
  ...jest.requireActual('../api/mock-attempts.service'),
  mockAttemptsService: { get: jest.fn(), recordEvent: jest.fn() },
}));

const api = jest.mocked(mockAttemptsService);
const network = () => Object.assign(new Error('Network Error'), { isAxiosError: true });
let emit: (state: AppStateStatus) => void = () => undefined;

beforeEach(() => {
  jest.clearAllMocks();
  useMockPlayerStore.setState({ attempts: {} });
  api.get.mockResolvedValue(makeInProgress());
  api.recordEvent.mockResolvedValue(undefined);
  // Mock AppState của jest-expo để `currentState` là hàm — trên máy thật nó là chuỗi 'active'.
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    emit = handler as (state: AppStateStatus) => void;
    return { remove: jest.fn() };
  });
});
afterEach(() => jest.restoreAllMocks());

async function mount() {
  const client = makeQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  await renderHook(
    () => {
      useMockAttempt('a1'); // giữ query `detail` sống để FOREGROUND có gì đó làm mới
      useAttemptAppStateEvents('a1', true);
    },
    { wrapper },
  );
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
}
const events = () => useMockPlayerStore.getState().attempts.a1?.events ?? [];

describe('useAttemptAppStateEvents', () => {
  it('rời app → gửi BACKGROUND kèm clientEventId; thành công thì rời hàng đợi', async () => {
    await mount();
    await act(async () => emit('background'));

    await waitFor(() => expect(api.recordEvent).toHaveBeenCalledTimes(1));
    expect(api.recordEvent.mock.calls[0]?.[1]).toMatchObject({
      clientEventId: expect.stringMatching(/^mock-ev-/) as string,
      type: 'BACKGROUND',
    });
    await waitFor(() => expect(events()).toEqual([]));
  });

  it('mất mạng: sự kiện nằm lại hàng đợi; quay lại app gửi bù ĐÚNG thứ tự, giữ nguyên clientEventId, và làm mới detail', async () => {
    api.recordEvent.mockRejectedValueOnce(network());
    await mount();
    await act(async () => emit('background'));
    await waitFor(() => expect(events()).toHaveLength(1));
    const queuedId = events()[0]?.clientEventId;

    await act(async () => emit('active'));
    await waitFor(() => expect(events()).toEqual([]));
    const sent = api.recordEvent.mock.calls.map((call) => call[1]);
    expect(sent.map((e) => e.type)).toEqual(['BACKGROUND', 'BACKGROUND', 'FOREGROUND']);
    expect(sent[1]?.clientEventId).toBe(queuedId); // gửi lại cùng id: BE idempotent
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2)); // FOREGROUND → lấy serverNow mới / phát hiện tự nộp
  });
});
