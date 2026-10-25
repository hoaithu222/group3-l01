import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

import { pomodoroKeys } from '../api/pomodoro.keys';
import { pomodoroService } from '../api/pomodoro.service';
import type { PomodoroCommandKind, PomodoroSnapshot } from '../api/pomodoro.types';
import { usePomodoroCommand } from '../hooks/usePomodoroCommand';
import { usePomodoroStore } from '../store/pomodoro.store';
import { apiErrorLike, focusSnapshot, makeSnapshot, ME_ID, NO_ACTIONS } from './fixtures';
import { makeQueryClient } from './helpers';

jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

/**
 * app.md p5-02 §4: `commandId` GIỮ tới khi có câu trả lời dứt khoát (mất mạng bấm lại dùng cùng id — PM-08), `expectedVersion` từ snapshot lúc bấm,
 * 409 `RES_003` ⇒ toast "Phiên vừa thay đổi" + tải lại.
 */

const commandSpy = jest.spyOn(pomodoroService, 'command');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let queryClient = makeQueryClient();

async function setup() {
  queryClient = makeQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return renderHook(() => usePomodoroCommand('ch1'), { wrapper });
}

type Hook = Awaited<ReturnType<typeof setup>>;

/** Chạy một lệnh TRONG `act` và chờ React Query gom thông báo (setTimeout 0) cũng trong `act` — không thì cảnh báo act nổ sau ca kiểm. */
async function runCommand(hook: Hook, kind: PomodoroCommandKind, version: number): Promise<PomodoroSnapshot | null> {
  let out: PomodoroSnapshot | null = null;
  await act(async () => {
    out = await hook.result.current.run(kind, version);
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
  return out;
}

const networkError = () => Object.assign(new Error('Network Error'), { isAxiosError: true });

beforeEach(() => {
  jest.clearAllMocks();
  usePomodoroStore.getState().reset();
  useAuthStore.setState({ user: { id: ME_ID, name: 'Tôi' } as never });
});

it('sinh commandId UUID, gửi expectedVersion của snapshot, kết quả vào cache', async () => {
  commandSpy.mockResolvedValue(focusSnapshot(1_500_000, { hostUserId: ME_ID, myActions: { ...NO_ACTIONS, canPause: true } }));
  const hook = await setup();

  const snapshot = await runCommand(hook, 'start', 0);

  expect(commandSpy).toHaveBeenCalledWith('ch1', 'start', { commandId: expect.stringMatching(UUID), expectedVersion: 0 });
  expect(snapshot).toMatchObject({ phase: 'FOCUS' });
  expect(queryClient.getQueryData(pomodoroKeys.snapshot('ch1'))).toMatchObject({ phase: 'FOCUS' });
});

it('mất mạng (không có phản hồi) rồi bấm lại: DÙNG LẠI cùng commandId; có phản hồi dứt khoát thì id mới', async () => {
  const hook = await setup();
  commandSpy.mockRejectedValueOnce(networkError()).mockRejectedValueOnce(networkError()).mockRejectedValueOnce(apiErrorLike(403, 'CALL_POMO_004'));
  commandSpy.mockResolvedValue(makeSnapshot());

  await runCommand(hook, 'pause', 3);
  await runCommand(hook, 'pause', 3);
  await runCommand(hook, 'pause', 3); // phản hồi 403 dứt khoát
  await runCommand(hook, 'pause', 3);

  const ids = commandSpy.mock.calls.map((call) => call[2].commandId);
  expect(ids[0]).toBe(ids[1]);
  expect(ids[1]).toBe(ids[2]);
  expect(ids[3]).not.toBe(ids[2]);
});

it('đổi version hoặc loại lệnh ⇒ commandId mới (đó là ý định khác)', async () => {
  const hook = await setup();
  commandSpy.mockRejectedValue(networkError());

  await runCommand(hook, 'skip', 3);
  await runCommand(hook, 'skip', 4);
  await runCommand(hook, 'end', 4);

  const ids = commandSpy.mock.calls.map((call) => call[2].commandId);
  expect(new Set(ids).size).toBe(3);
});

it('409 RES_003 ⇒ toast "Phiên vừa thay đổi" và tải lại snapshot', async () => {
  const hook = await setup();
  queryClient.setQueryData(pomodoroKeys.snapshot('ch1'), focusSnapshot(600_000));
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  commandSpy.mockRejectedValue(apiErrorLike(409, 'RES_003'));

  await runCommand(hook, 'pause', 1);

  expect(showToast).toHaveBeenCalledWith('warning', 'Phiên vừa thay đổi');
  expect(invalidate).toHaveBeenCalledWith({ queryKey: pomodoroKeys.snapshot('ch1') });
});

it('lỗi khác (không phải chủ phòng) ⇒ toast nhãn tiếng Việt của feature', async () => {
  const hook = await setup();
  commandSpy.mockRejectedValue(apiErrorLike(403, 'CALL_POMO_004'));

  await runCommand(hook, 'end', 1);

  expect(showToast).toHaveBeenCalledWith('error', 'Chỉ chủ phòng được thực hiện thao tác này');
});

it('đang có lệnh chạy thì lệnh thứ hai bị bỏ (không gửi chồng)', async () => {
  const hook = await setup();
  let release: (value: PomodoroSnapshot) => void = () => undefined;
  commandSpy.mockReturnValue(new Promise((resolve) => (release = resolve)));

  let first: Promise<unknown> = Promise.resolve();
  await act(async () => {
    first = hook.result.current.run('pause', 1);
    expect(await hook.result.current.run('skip', 1)).toBeNull();
  });
  expect(commandSpy).toHaveBeenCalledTimes(1);
  await act(async () => {
    release(makeSnapshot());
    await first;
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
});
