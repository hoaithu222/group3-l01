import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { io } from 'socket.io-client';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SocketEvent } from '@/core/socket';
import { useToastStore } from '@/shared/ui/feedback/toast-store';

import { gamificationService } from '../api/gamification.service';
import type { GamificationUpdatedPayload, MyGamificationDto } from '../api/gamification.types';
import { GamificationEventHost } from '../components/GamificationEventHost';
import { gamificationKeys } from '../queries/gamification.keys';

/**
 * app.md p4-03 §8: host — sự kiện có `levelUp` ⇒ modal hiện MỘT lần dù nhận hai sự kiện trùng; đóng ⇒ gọi `seen`; hoãn
 * modal khi đang ở màn thi thử; toast huy hiệu; cờ tắt ⇒ im; `levelUpPending` từ server (lỡ sự kiện) cũng hiện.
 */

const mockPath = { current: '/' };
const mockFlag = { current: true };
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  usePathname: () => mockPath.current,
}));
jest.mock('@/shell/capabilities', () => ({ useFeature: () => mockFlag.current }));

interface MockSocket {
  __emitServer: (event: string, payload?: unknown) => void;
}
const mockSocket = (io as jest.MockedFunction<typeof io>).mock.results[0]?.value as MockSocket;

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

const profile = (overrides: Partial<MyGamificationDto> = {}): MyGamificationDto => ({
  counters: {},
  level: 12,
  levelSpan: 500,
  longestStreak: 3,
  serverNow: '2026-09-25T00:00:00.000Z',
  showcase: [],
  streak: 3,
  streakAtRisk: false,
  unseenBadges: [],
  xp: 5_000,
  xpIntoLevel: 480,
  xpToNext: 20,
  ...overrides,
});

const LEVEL_UP: GamificationUpdatedPayload = {
  level: 13,
  levelUp: { from: 12, to: 13 },
  newBadges: [],
  streak: 4,
  xp: 5_020,
};

const meSpy = jest.spyOn(gamificationService, 'me');
const seenSpy = jest.spyOn(gamificationService, 'seen');

let queryClient: QueryClient;

async function renderHost() {
  queryClient = new QueryClient({
    defaultOptions: { mutations: { gcTime: 0 }, queries: { gcTime: Infinity, retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(<GamificationEventHost />, { wrapper: Wrapper });
}

/** Phát sự kiện rồi chờ nhịp tải lại `me` + thông báo của React Query xong TRONG act (không thì cảnh báo act nổ sau ca kiểm). */
async function emit(payload: GamificationUpdatedPayload): Promise<void> {
  await act(async () => {
    mockSocket.__emitServer(SocketEvent.GAMIFICATION_UPDATED, payload);
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPath.current = '/';
  mockFlag.current = true;
  useToastStore.getState().clear();
  // Server sau khi lên cấp 13: còn chờ modal (`levelUpPending`), ngưỡng mới.
  meSpy.mockResolvedValue(
    profile({
      level: 13,
      levelUpPending: { from: 12, to: 13 },
      xp: 5_020,
      xpIntoLevel: 0,
      xpToNext: 450,
    }),
  );
  seenSpy.mockResolvedValue(undefined);
});

afterEach(() => {
  useToastStore.getState().clear();
});

it('levelUp ⇒ modal "Lên cấp 13!" hiện MỘT lần dù nhận hai sự kiện trùng; "Tuyệt" ⇒ seen { level: 13 }', async () => {
  await renderHost();
  expect(screen.queryByText('Lên cấp 13!')).toBeNull();

  await emit(LEVEL_UP);
  await emit(LEVEL_UP);

  expect(await screen.findAllByText('Lên cấp 13!')).toHaveLength(1);
  // Tải lại `me` sau sự kiện: hiện đúng số XP còn thiếu tới cấp kế.
  expect(await screen.findByText(/Còn 450 XP để lên cấp 14/)).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Tuyệt' }));

  await waitFor(() => expect(seenSpy).toHaveBeenCalledWith({ level: 13 }));
  expect(seenSpy).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByText('Lên cấp 13!')).toBeNull());
  // Cache làm cùng luật server: hết `levelUpPending`.
  expect(
    queryClient.getQueryData<MyGamificationDto>(gamificationKeys.me())?.levelUpPending,
  ).toBeUndefined();

  // Sự kiện trùng đến muộn sau khi đã đóng vẫn KHÔNG bật lại (sổ cấp đã xếp trong phiên).
  await emit(LEVEL_UP);
  expect(screen.queryByText('Lên cấp 13!')).toBeNull();
});

it('đang ở màn thi thử ⇒ HOÃN modal; rời màn ⇒ hiện', async () => {
  mockPath.current = '/study/attempts/a1';
  const view = await renderHost();

  await emit(LEVEL_UP);
  await waitFor(() => expect(meSpy).toHaveBeenCalled());
  expect(screen.queryByText('Lên cấp 13!')).toBeNull();

  mockPath.current = '/study/results/a1';
  await view.rerender(<GamificationEventHost />);

  expect(await screen.findByText('Lên cấp 13!')).toBeOnTheScreen();
});

it('huy hiệu mới không kèm lên cấp ⇒ toast "Huy hiệu mới" (một lần dù sự kiện trùng)', async () => {
  meSpy.mockResolvedValue(profile()); // server không có cấp nào đang chờ
  await renderHost();
  const payload: GamificationUpdatedPayload = {
    level: 12,
    newBadges: [{ code: 'DILIGENT', emoji: '💪', id: 'b1', name: 'Chăm chỉ' }],
    streak: 3,
    xp: 5_010,
  };

  await emit(payload);
  await emit(payload);

  const toasts = useToastStore.getState().toasts;
  expect(toasts).toHaveLength(1);
  expect(toasts[0]?.message).toBe('Huy hiệu mới: 💪 Chăm chỉ');
  expect(screen.queryByText(/Lên cấp/)).toBeNull();
});

it('lên cấp kèm huy hiệu mới ⇒ danh sách huy hiệu nằm TRONG modal, không toast riêng', async () => {
  await renderHost();
  await emit({ ...LEVEL_UP, newBadges: [{ code: 'B', emoji: '🏆', id: 'b2', name: 'Bền bỉ' }] });

  expect(await screen.findByText('Lên cấp 13!')).toBeOnTheScreen();
  expect(screen.getByText('🏆 Bền bỉ')).toBeOnTheScreen();
  expect(useToastStore.getState().toasts).toHaveLength(0);
});

it('cờ `gamification` tắt ⇒ không hiện gì và không gọi API', async () => {
  mockFlag.current = false;
  await renderHost();

  await emit(LEVEL_UP);

  expect(screen.queryByText('Lên cấp 13!')).toBeNull();
  expect(meSpy).not.toHaveBeenCalled();
});

it('lỡ sự kiện (mở app khi `me.levelUpPending` còn) ⇒ vẫn hiện modal', async () => {
  await renderHost();
  expect(await screen.findByText('Lên cấp 13!')).toBeOnTheScreen();
});

it('máy khác đã bấm "Tuyệt" (server hết chờ sau khi tải lại) ⇒ máy này KHÔNG hiện modal (GM-03)', async () => {
  meSpy.mockResolvedValue(profile({ level: 13, xp: 5_020, xpIntoLevel: 0, xpToNext: 450 }));
  await renderHost();

  await emit(LEVEL_UP);
  await waitFor(() => expect(meSpy).toHaveBeenCalled());

  await waitFor(() => expect(screen.queryByText('Lên cấp 13!')).toBeNull());
});
