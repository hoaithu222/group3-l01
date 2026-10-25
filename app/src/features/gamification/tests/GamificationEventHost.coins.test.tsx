import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';
import { io } from 'socket.io-client';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SocketEvent } from '@/core/socket';

import { gamificationService } from '../api/gamification.service';
import type { CoinsUpdatedPayload, MyGamificationDto } from '../api/gamification.types';
import { GamificationEventHost } from '../components/GamificationEventHost';
import { gamificationKeys } from '../queries/gamification.keys';
import { isCoinsOnlyEvent } from '../utils/gamification-events';

/**
 * p7-02: BE phát `gamification:updated` chỉ có `coins` (đổi số dư ví). Host XP phải BỎ QUA — nếu vá vào hồ sơ thì
 * `xp/level/streak` thành `undefined` (huy hiệu cấp/thanh XP hỏng) và mỗi lần thưởng xu lại tải lại `me` vô ích.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  usePathname: () => '/',
}));
jest.mock('@/shell/capabilities', () => ({ useFeature: () => true }));

interface MockSocket {
  __emitServer: (event: string, payload?: unknown) => void;
}
const mockSocket = (io as jest.MockedFunction<typeof io>).mock.results[0]?.value as MockSocket;

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

const PROFILE: MyGamificationDto = {
  counters: {},
  level: 12,
  levelSpan: 500,
  longestStreak: 3,
  serverNow: '2026-09-27T00:00:00.000Z',
  showcase: [],
  streak: 3,
  streakAtRisk: false,
  unseenBadges: [],
  xp: 5_000,
  xpIntoLevel: 480,
  xpToNext: 20,
};

const COINS_ONLY: CoinsUpdatedPayload = {
  coins: { balance: 120, delta: 20, reason: 'EARN_EVENT' },
};

const meSpy = jest.spyOn(gamificationService, 'me');

async function renderHost(): Promise<QueryClient> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(gamificationKeys.me(), PROFILE);
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  render(<GamificationEventHost />, { wrapper: Wrapper });
  return queryClient;
}

beforeEach(() => {
  jest.clearAllMocks();
  meSpy.mockResolvedValue(PROFILE);
});

it('sự kiện chỉ có coins ⇒ hồ sơ XP trong cache giữ nguyên và KHÔNG tải lại me', async () => {
  const queryClient = await renderHost();
  // Cache đã có hồ sơ và `staleTime` 60 s nên host không tải `me` lúc mount — mọi lần gọi `me` sau đây là do sự kiện.
  // `waitFor` xả phạm vi act của lần render trước khi phát sự kiện (không thì React báo act chồng nhau).
  await waitFor(() => expect(queryClient.getQueryData(gamificationKeys.me())).toEqual(PROFILE));

  await act(async () => {
    mockSocket.__emitServer(SocketEvent.GAMIFICATION_UPDATED, COINS_ONLY);
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  expect(queryClient.getQueryData<MyGamificationDto>(gamificationKeys.me())).toEqual(PROFILE);
  expect(meSpy).not.toHaveBeenCalled();
});

it('isCoinsOnlyEvent: chỉ coi là "chỉ coins" khi payload không có xp', () => {
  expect(isCoinsOnlyEvent(COINS_ONLY)).toBe(true);
  expect(isCoinsOnlyEvent({ level: 13, newBadges: [], streak: 4, xp: 5_020 })).toBe(false);
});
