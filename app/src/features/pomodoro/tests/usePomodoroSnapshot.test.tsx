import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { SocketEvent } from '@/core/socket';
import { useAuthStore } from '@/shell/store/slices/auth';

import { pomodoroKeys } from '../api/pomodoro.keys';
import { pomodoroService } from '../api/pomodoro.service';
import type { PomodoroSnapshot } from '../api/pomodoro.types';
import { usePomodoroSnapshot } from '../hooks/usePomodoroSnapshot';
import { usePomodoroStore } from '../store/pomodoro.store';
import { focusSnapshot, HOST_ID, makeSnapshot, ME_ID, NO_ACTIONS, SERVER_NOW } from './fixtures';
import { emitServer, makeQueryClient } from './helpers';
import { QueryClientProvider } from '@tanstack/react-query';

/**
 * app.md p5-02 §8: mock socket phát chuỗi WAITING → FOCUS → SHORT_BREAK ⇒ cache đổi đúng từng bước, nhãn phase đổi; sự kiện của kênh khác / bản cũ tới
 * muộn bị bỏ; đổi chủ phòng ⇒ tải lại REST để lấy `myActions` chính thống.
 */

const getSpy = jest.spyOn(pomodoroService, 'getSnapshot');
const at = (ms: number) => new Date(SERVER_NOW + ms).toISOString();

let queryClient = makeQueryClient();
const cache = () => queryClient.getQueryData<PomodoroSnapshot>(pomodoroKeys.snapshot('ch1')) as PomodoroSnapshot;

async function setup(initial: PomodoroSnapshot) {
  queryClient = makeQueryClient();
  getSpy.mockResolvedValue(initial);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const view = await renderHook(() => usePomodoroSnapshot('ch1', true), { wrapper });
  await waitFor(() => expect(view.result.current.snapshot).toBeDefined());
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  usePomodoroStore.getState().reset();
  useAuthStore.setState({ user: { id: ME_ID, name: 'Tôi' } as never });
});

it('WAITING → FOCUS → SHORT_BREAK: cache đổi theo từng sự kiện, nút chủ phòng suy ra đúng, mục tiêu của tôi được giữ', async () => {
  const rest = makeSnapshot({
    hostUserId: ME_ID,
    myActions: { ...NO_ACTIONS, canConfigure: true, canEnd: true, canStart: true },
    myGoal: { shared: false, text: 'xong chương 3' },
    phase: 'WAITING',
    sessionId: 's1',
    version: 1,
  });
  const { result } = await setup(rest);
  expect(result.current.snapshot?.phase).toBe('WAITING');

  await emitServer(SocketEvent.POMODORO_UPDATED, { ...focusSnapshot(1_500_000, { hostUserId: ME_ID, serverNow: at(1000), version: 2 }), myActions: undefined, myGoal: undefined });
  expect(cache()).toMatchObject({ phase: 'FOCUS', version: 2 });
  expect(cache().myActions).toMatchObject({ canPause: true, canSkip: true, canStart: false });
  expect(cache().myGoal).toEqual({ shared: false, text: 'xong chương 3' });
  expect(result.current.snapshot?.phase).toBe('FOCUS');

  await emitServer(SocketEvent.POMODORO_UPDATED, {
    ...focusSnapshot(300_000, { hostUserId: ME_ID, phase: 'SHORT_BREAK', rules: { cameraAllowed: true, micAllowed: true, screenShareAllowed: true }, serverNow: at(2000), version: 3 }),
    myActions: undefined,
    myGoal: undefined,
  });
  expect(cache()).toMatchObject({ phase: 'SHORT_BREAK', version: 3 });
  expect(cache().rules.micAllowed).toBe(true);
  expect(getSpy).toHaveBeenCalledTimes(1); // đổi phase thường không tốn thêm lượt REST
});

it('bản cũ tới muộn và sự kiện của kênh khác đều bị bỏ', async () => {
  await setup(focusSnapshot(600_000, { myActions: { ...NO_ACTIONS }, version: 5 }));

  await emitServer(SocketEvent.POMODORO_UPDATED, focusSnapshot(900_000, { serverNow: at(1000), version: 4 }));
  expect(cache().version).toBe(5);

  await emitServer(SocketEvent.POMODORO_UPDATED, { ...focusSnapshot(1000, { serverNow: at(2000), version: 9 }), channelId: 'ch-khac' });
  expect(cache().version).toBe(5);
});

it('mỗi sự kiện ghi một mẫu lệch đồng hồ vào store (trung vị 5 mẫu)', async () => {
  await setup(focusSnapshot(600_000, { myActions: { ...NO_ACTIONS } }));
  const before = usePomodoroStore.getState().offsetSamples.ch1?.length ?? 0;
  await emitServer(SocketEvent.POMODORO_UPDATED, focusSnapshot(590_000, { serverNow: at(10_000), version: 3 }));
  expect(usePomodoroStore.getState().offsetSamples.ch1?.length).toBe(before + 1);
});

it('đổi chủ phòng ⇒ tải lại REST (có jitter) để lấy myActions chính thống', async () => {
  const random = jest.spyOn(Math, 'random').mockReturnValue(0);
  await setup(focusSnapshot(600_000, { hostUserId: HOST_ID, myActions: { ...NO_ACTIONS } }));
  expect(getSpy).toHaveBeenCalledTimes(1);

  await emitServer(SocketEvent.POMODORO_UPDATED, focusSnapshot(590_000, { hostUserId: ME_ID, serverNow: at(10_000), version: 3 }));
  await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(2));
  random.mockRestore();
});

it('phiên kết thúc lúc tôi đang trong phòng ⇒ ghi nhận `ended` cho tấm kết quả', async () => {
  await setup(focusSnapshot(600_000, { myActions: { ...NO_ACTIONS } }));
  usePomodoroStore.getState().patchRoom({ callId: 'call1', channelId: 'ch1' });

  await emitServer(SocketEvent.POMODORO_UPDATED, makeSnapshot({ hostUserId: HOST_ID, phase: 'ENDED', serverNow: at(20_000), sessionId: 's1', version: 9 }));
  expect(usePomodoroStore.getState().ended).toEqual({ channelId: 'ch1', sessionId: 's1' });
});
