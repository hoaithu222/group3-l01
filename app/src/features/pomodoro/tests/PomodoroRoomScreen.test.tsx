import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { FakeCallMedia } from '@/core/media/call-media.fake';
import { setCallMediaForTests } from '@/core/media/call-media.registry';
import { SocketEvent } from '@/core/socket';
import { useAuthStore } from '@/shell/store/slices/auth';

import { pomodoroService } from '../api/pomodoro.service';
import type { PomodoroJoinResult, PomodoroSnapshot } from '../api/pomodoro.types';
import { teardownPomodoroSession } from '../hooks/pomodoro-session.controller';
import { PomodoroRoomScreen } from '../screens/PomodoroRoomScreen';
import { usePomodoroStore } from '../store/pomodoro.store';
import { apiErrorLike, focusSnapshot, HOST_ID, makeSnapshot, ME_ID, NO_ACTIONS, SERVER_NOW } from './fixtures';
import { emitServer, makeQueryClient, renderWithProviders } from './helpers';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn().mockResolvedValue(undefined), deactivateKeepAwake: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/core/device/device-id', () => ({ getDeviceId: jest.fn().mockResolvedValue('device-12345678') }));
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }) }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

/**
 * app.md p5-02 §3, §8: preview (chỉ xem) → "Vào học" (vào với mic TẮT) → trong phòng: mic KHOÁ khi tập trung (icon khoá + chữ), sang nghỉ chỉ gợi ý (PM-06);
 * điều khiển chủ phòng theo `myActions`; Rời có xác nhận; phiên kết thúc lúc đang trong phòng ⇒ tấm kết quả; mất quyền ⇒ về danh sách kênh.
 */

const getSpy = jest.spyOn(pomodoroService, 'getSnapshot');
const joinSpy = jest.spyOn(pomodoroService, 'join');
const leaveSpy = jest.spyOn(pomodoroService, 'leave');
const commandSpy = jest.spyOn(pomodoroService, 'command');
const resultSpy = jest.spyOn(pomodoroService, 'sessionResult');
const at = (ms: number) => new Date(SERVER_NOW + ms).toISOString();
const BREAK_RULES = { cameraAllowed: true, micAllowed: true, screenShareAllowed: true };

let media: FakeCallMedia;

const joinResult = (snapshot: PomodoroSnapshot): PomodoroJoinResult => ({
  call: { id: 'call1' },
  expiresAt: at(600_000),
  livekitUrl: 'wss://lk.example',
  serverNow: at(0),
  snapshot,
  token: 'tok',
});

const viewerSnapshot = (over: Partial<PomodoroSnapshot> = {}) =>
  focusSnapshot(600_000, {
    myActions: { ...NO_ACTIONS },
    participants: [{ goal: 'Giải tích chương 3', isHost: true, name: 'Lan', userId: HOST_ID }],
    ...over,
  });

async function mount(snapshot: PomodoroSnapshot) {
  getSpy.mockResolvedValue(snapshot);
  const view = await renderWithProviders(<PomodoroRoomScreen channelId="ch1" wsId="ws1" />, makeQueryClient());
  await screen.findByText('Luật phòng');
  return view;
}

async function join(snapshot: PomodoroSnapshot) {
  joinSpy.mockResolvedValue(joinResult(snapshot));
  await fireEvent.press(screen.getByRole('button', { name: 'Vào học' }));
  await screen.findByLabelText('Rời phòng học');
}

beforeEach(async () => {
  jest.clearAllMocks();
  media = new FakeCallMedia();
  setCallMediaForTests(media);
  usePomodoroStore.getState().reset();
  useAuthStore.setState({ user: { id: ME_ID, name: 'Tôi' } as never });
  leaveSpy.mockResolvedValue(undefined);
});

afterEach(async () => {
  await act(async () => teardownPomodoroSession());
  setCallMediaForTests(null);
});

it('preview: nhãn giai đoạn CHỮ, đồng hồ, luật mic, người đang học kèm mục tiêu chia sẻ; chưa vào phòng thì chưa nối media', async () => {
  await mount(viewerSnapshot());

  expect(screen.getByText('Tập trung')).toBeOnTheScreen();
  expect(screen.getByLabelText(/Còn khoảng \d+ phút, giai đoạn Tập trung/)).toBeOnTheScreen();
  expect(screen.getByText('Mic tắt khi tập trung — máy chủ khoá, không bật được')).toBeOnTheScreen();
  expect(screen.getByText('Lan')).toBeOnTheScreen();
  expect(screen.getByText('Giải tích chương 3')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Vào học' })).toBeOnTheScreen();
  expect(media.connectCalls).toHaveLength(0);
});

it('preview: "Lịch sử học của tôi" là MỘT hàng có mũi tên (không phải nút lẻ) và mở màn lịch sử', async () => {
  await mount(viewerSnapshot());

  await fireEvent.press(screen.getByText('Lịch sử học của tôi'));
  expect(router.push).toHaveBeenCalledWith('/me/pomodoro-history');
});

it('kênh chưa có phiên: gợi ý "bấm Bắt đầu để mở phòng" + Bắt đầu / Vào phòng chờ / Cấu hình theo myActions', async () => {
  await mount(makeSnapshot({ myActions: { ...NO_ACTIONS, canConfigure: true, canStart: true } }));

  expect(screen.getByText('Chưa có phiên — bấm Bắt đầu để mở phòng')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Bắt đầu' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Vào phòng chờ' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Cấu hình' })).toBeOnTheScreen();
});

it('"Vào học": vào với mic/camera TẮT; đang tập trung thì mic KHOÁ (icon khoá + chữ "Mic tắt khi tập trung")', async () => {
  await mount(viewerSnapshot());
  await join(viewerSnapshot());

  expect(joinSpy).toHaveBeenCalledWith('ch1', 'device-12345678', false);
  await waitFor(() => expect(media.connectCalls).toHaveLength(1));
  expect(media.connectCalls[0]).toMatchObject({ audio: false, video: false });
  expect((await screen.findAllByText('Mic tắt khi tập trung')).length).toBeGreaterThan(0);
  expect(screen.getByLabelText('Micro đang bị khoá khi tập trung')).toBeDisabled();
});

it('sang nghỉ: mở khoá mic nhưng KHÔNG tự bật (PM-06); chỉ gợi ý "Bạn có thể bật mic"', async () => {
  await mount(viewerSnapshot());
  await join(viewerSnapshot());

  await emitServer(SocketEvent.POMODORO_UPDATED, {
    ...focusSnapshot(300_000, { phase: 'SHORT_BREAK', rules: BREAK_RULES, serverNow: at(5000), version: 3 }),
    myActions: undefined,
    myGoal: undefined,
  });

  expect(await screen.findByText('Nghỉ ngắn')).toBeOnTheScreen();
  expect(screen.getByText('Bạn có thể bật mic (mic vẫn tắt cho tới khi bạn bật)')).toBeOnTheScreen();
  expect(screen.getByLabelText('Bật micro')).toBeEnabled();
  expect(usePomodoroStore.getState().room.micOn).toBe(false);
});

it('người không phải chủ phòng KHÔNG thấy điều khiển nào', async () => {
  await mount(viewerSnapshot());
  await join(viewerSnapshot());

  expect(screen.queryByRole('button', { name: 'Tạm dừng' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Kết thúc' })).toBeNull();
});

it('chủ phòng thấy điều khiển theo myActions; Tạm dừng gửi đúng expectedVersion', async () => {
  const host = viewerSnapshot({ hostUserId: ME_ID, myActions: { ...NO_ACTIONS, canEnd: true, canPause: true, canSkip: true }, version: 7 });
  commandSpy.mockResolvedValue(host);
  await mount(host);
  await join(host);

  await fireEvent.press(await screen.findByRole('button', { name: 'Tạm dừng' }));

  await waitFor(() => expect(commandSpy).toHaveBeenCalledWith('ch1', 'pause', { commandId: expect.any(String), expectedVersion: 7 }));
});

it('Rời phòng có xác nhận; đồng ý ⇒ ngắt media + báo server + về preview', async () => {
  await mount(viewerSnapshot());
  await join(viewerSnapshot());

  await fireEvent.press(screen.getByLabelText('Rời phòng học'));
  expect(await screen.findByText('Rời phòng học?')).toBeOnTheScreen();
  expect(leaveSpy).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Rời phòng' }));

  await waitFor(() => expect(leaveSpy).toHaveBeenCalledWith('call1'));
  expect(media.getState()).toBe('disconnected');
  expect(await screen.findByRole('button', { name: 'Vào học' })).toBeOnTheScreen();
});

it('phiên kết thúc lúc tôi đang trong phòng ⇒ tấm "Kết quả phiên" với số của riêng tôi + chú thích nhật ký cá nhân', async () => {
  resultSpy.mockResolvedValue({
    mine: { cyclesAttended: 3, goal: 'xong chương 3', interruptions: 1, presentSeconds: 75 * 60 },
    serverNow: at(0),
    session: { channelId: 'ch1', completedFocusCycles: 3, config: makeSnapshot().config, endReason: 'HOST_ENDED', endedAt: at(0), sessionId: 's1', skippedFocusCycles: 1, startedAt: at(-1000) },
  });
  await mount(viewerSnapshot());
  await join(viewerSnapshot());

  await emitServer(SocketEvent.POMODORO_UPDATED, { ...makeSnapshot({ hostUserId: HOST_ID, phase: 'ENDED', serverNow: at(9000), sessionId: 's1', version: 9 }), myActions: undefined });

  expect(await screen.findByText('Kết quả phiên')).toBeOnTheScreen();
  expect(await screen.findByText('1 giờ 15 phút')).toBeOnTheScreen();
  expect(screen.getByText('Nhật ký cá nhân, không dùng để chấm điểm.')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Xong' }));
  await waitFor(() => expect(leaveSpy).toHaveBeenCalledWith('call1'));
  expect(usePomodoroStore.getState().ended).toBeNull();
});

it('mất quyền / 404 ⇒ "Kênh không còn khả dụng" + về danh sách kênh', async () => {
  getSpy.mockRejectedValue(apiErrorLike(404, 'RES_001'));
  await renderWithProviders(<PomodoroRoomScreen channelId="ch1" wsId="ws1" />);
  expect(await screen.findByText('Kênh không còn khả dụng')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Về danh sách kênh' }));
  expect(router.replace).toHaveBeenCalledWith({ params: { wsId: 'ws1' }, pathname: '/workspaces/[wsId]/channels' });
});
