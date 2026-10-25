import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { FakeCallMedia } from '@/core/media/call-media.fake';
import { setCallMediaForTests } from '@/core/media/call-media.registry';
import { useAuthStore } from '@/shell/store/slices/auth';

import { pomodoroService } from '../api/pomodoro.service';
import type { PomodoroSnapshot } from '../api/pomodoro.types';
import { teardownPomodoroSession } from '../hooks/pomodoro-session.controller';
import { PomodoroRoomScreen } from '../screens/PomodoroRoomScreen';
import { usePomodoroStore } from '../store/pomodoro.store';
import { apiErrorLike, focusSnapshot, makeSnapshot, ME_ID, NO_ACTIONS, SERVER_NOW } from './fixtures';
import { makeQueryClient, renderWithProviders } from './helpers';

const mockConnection = { value: 'connected' };

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn().mockResolvedValue(undefined), deactivateKeepAwake: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/core/device/device-id', () => ({ getDeviceId: jest.fn().mockResolvedValue('device-12345678') }));
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }) }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/core/socket', () => ({ ...jest.requireActual('@/core/socket'), useConnectionState: () => mockConnection.value }));

/**
 * Luồng vào phòng của màn Pomodoro (app.md §3): "Bắt đầu" ở preview = vào phòng RỒI mới chạy vòng đầu; `CALL_004` hỏi chuyển máy rồi vào lại với `force`;
 * phòng đầy hiện lý do và tải lại; ngoại tuyến khoá nút; rời màn = rời phòng (không để media chạy mồ côi).
 */

const getSpy = jest.spyOn(pomodoroService, 'getSnapshot');
const joinSpy = jest.spyOn(pomodoroService, 'join');
const leaveSpy = jest.spyOn(pomodoroService, 'leave');
const commandSpy = jest.spyOn(pomodoroService, 'command');

const joined = (snapshot: PomodoroSnapshot) => ({
  call: { id: 'call1' },
  expiresAt: new Date(SERVER_NOW + 600_000).toISOString(),
  livekitUrl: 'wss://lk.example',
  serverNow: new Date(SERVER_NOW).toISOString(),
  snapshot,
  token: 'tok',
});

const virtual = () => makeSnapshot({ myActions: { ...NO_ACTIONS, canConfigure: true, canStart: true } });
/** Phiên WAITING vừa mở bởi "Vào phòng chờ": tôi là chủ phòng nên được Bắt đầu. */
const waitingAsHost = () => makeSnapshot({ hostUserId: ME_ID, myActions: { ...NO_ACTIONS, canEnd: true, canStart: true }, sessionId: 's1', version: 1 });

let media: FakeCallMedia;

beforeEach(() => {
  jest.clearAllMocks();
  mockConnection.value = 'connected';
  media = new FakeCallMedia();
  setCallMediaForTests(media);
  usePomodoroStore.getState().reset();
  useAuthStore.setState({ user: { id: ME_ID, name: 'Tôi' } as never });
  getSpy.mockResolvedValue(virtual());
  leaveSpy.mockResolvedValue(undefined);
});

afterEach(async () => {
  await act(async () => teardownPomodoroSession());
  setCallMediaForTests(null);
});

const mount = () => renderWithProviders(<PomodoroRoomScreen channelId="ch1" wsId="ws1" />, makeQueryClient());

it('"Bắt đầu" ở preview: vào phòng TRƯỚC, rồi chạy vòng đầu với version của phiên vừa mở', async () => {
  joinSpy.mockResolvedValue(joined(waitingAsHost()));
  commandSpy.mockResolvedValue(focusSnapshot(1_500_000, { hostUserId: ME_ID, myActions: { ...NO_ACTIONS, canPause: true } }));
  await mount();

  await fireEvent.press(await screen.findByRole('button', { name: 'Bắt đầu' }));

  await waitFor(() => expect(commandSpy).toHaveBeenCalledWith('ch1', 'start', { commandId: expect.any(String), expectedVersion: 1 }));
  expect(joinSpy.mock.invocationCallOrder[0]).toBeLessThan(commandSpy.mock.invocationCallOrder[0] ?? 0);
  expect(await screen.findByRole('button', { name: 'Tạm dừng' })).toBeOnTheScreen();
});

it('CALL_004 (đang ở máy khác/cuộc gọi khác) ⇒ hỏi chuyển sang máy này; đồng ý ⇒ vào lại với force', async () => {
  getSpy.mockResolvedValue(focusSnapshot(600_000, { myActions: { ...NO_ACTIONS } }));
  joinSpy.mockRejectedValueOnce(apiErrorLike(409, 'CALL_004')).mockResolvedValue(joined(focusSnapshot(600_000)));
  await mount();

  await fireEvent.press(await screen.findByRole('button', { name: 'Vào học' }));
  expect(await screen.findByText('Chuyển sang máy này?')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Chuyển sang đây' }));

  await waitFor(() => expect(joinSpy).toHaveBeenLastCalledWith('ch1', 'device-12345678', true));
  expect(await screen.findByLabelText('Rời phòng học')).toBeOnTheScreen();
});

it('phòng đầy (CALL_008) ⇒ nói lý do và tải lại snapshot; không nối media', async () => {
  getSpy.mockResolvedValue(focusSnapshot(600_000, { myActions: { ...NO_ACTIONS } }));
  joinSpy.mockRejectedValue(apiErrorLike(409, 'CALL_008'));
  await mount();

  await fireEvent.press(await screen.findByRole('button', { name: 'Vào học' }));

  expect(await screen.findByText('Phòng đã đủ người')).toBeOnTheScreen();
  await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(2));
  expect(media.connectCalls).toHaveLength(0);
});

it('ngoại tuyến: nói rõ và khoá nút vào', async () => {
  mockConnection.value = 'offline';
  getSpy.mockResolvedValue(focusSnapshot(600_000, { myActions: { ...NO_ACTIONS } }));
  await mount();

  expect(await screen.findByText('Bạn đang ngoại tuyến — cần mạng để vào học.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Vào học' })).toBeDisabled();
});

it('kênh lưu trữ: chỉ xem — không có nút vào, có dòng giải thích', async () => {
  getSpy.mockResolvedValue(focusSnapshot(600_000, { myActions: { ...NO_ACTIONS, canJoin: false, joinBlockedReason: 'ARCHIVED' } }));
  await mount();

  expect(await screen.findByText('Kênh đã lưu trữ — chỉ xem, không vào phòng được.')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Vào học' })).toBeNull();
});

it('rời màn khi đang trong phòng ⇒ tự rời phòng (ngắt media + báo server) và xoá state theo kênh', async () => {
  getSpy.mockResolvedValue(focusSnapshot(600_000, { myActions: { ...NO_ACTIONS } }));
  joinSpy.mockResolvedValue(joined(focusSnapshot(600_000)));
  const view = await mount();
  await fireEvent.press(await screen.findByRole('button', { name: 'Vào học' }));
  await screen.findByLabelText('Rời phòng học');
  await act(async () => usePomodoroStore.getState().setGoalDraft('s1', 'nháp'));

  await view.unmount();

  await waitFor(() => expect(leaveSpy).toHaveBeenCalledWith('call1'));
  expect(media.getState()).toBe('disconnected');
  expect(usePomodoroStore.getState().goalDraft).toEqual({});
});
