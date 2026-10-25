import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { gamificationService } from '../api/gamification.service';
import type { LeaderboardDto, LeaderboardEntry } from '../api/gamification.types';
import { gamificationKeys } from '../queries/gamification.keys';
import { LeaderboardScreen } from '../screens/LeaderboardScreen';

/**
 * app.md p4-03 §8: Leaderboard — `me.hidden` hiện dòng "Bạn đang ẩn"; đổi kỳ ⇒ query key đổi (gọi lại theo kỳ mới);
 * top 3 có HẠNG bằng chữ; 404 ⇒ "Không truy cập được"; chạm dòng ⇒ hồ sơ công khai (404 trung tính).
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ wsId: 'ws1' }),
}));
jest.mock('@/shell/capabilities', () => ({ useFeature: () => true }));

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

const entry = (rank: number, name: string, xp: number): LeaderboardEntry => ({
  avatarAssetId: null,
  level: 7,
  name,
  rank,
  userId: `u${rank}`,
  xp,
});

const board = (overrides: Partial<LeaderboardDto> = {}): LeaderboardDto => ({
  entries: [
    entry(1, 'An', 900),
    entry(2, 'Bình', 800),
    entry(3, 'Chi', 700),
    entry(4, 'Dũng', 600),
  ],
  from: null,
  me: { hidden: false, rank: 12, xp: 340 },
  period: 'WEEK',
  serverNow: '2026-09-25T00:00:00.000Z',
  to: null,
  ...overrides,
});

const leaderboardSpy = jest.spyOn(gamificationService, 'leaderboard');
const publicSpy = jest.spyOn(gamificationService, 'publicProfile');
const privacySpy = jest.spyOn(gamificationService, 'updatePrivacy');

let queryClient: QueryClient;

async function renderScreen() {
  queryClient = new QueryClient({
    defaultOptions: { mutations: { gcTime: 0 }, queries: { gcTime: Infinity, retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(<LeaderboardScreen />, { wrapper: Wrapper });
}

/** Chờ nhịp thông báo của React Query xong TRONG act (không thì cảnh báo act nổ sau ca kiểm). */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

beforeEach(() => {
  jest.clearAllMocks();
  leaderboardSpy.mockResolvedValue(board());
});

it('top 3 nổi bật có HẠNG bằng chữ; từ hạng 4 là danh sách; dòng "Bạn: hạng 12" ghim đáy', async () => {
  await renderScreen();

  expect(await screen.findByText('Hạng 1')).toBeOnTheScreen();
  expect(screen.getByText('Hạng 3')).toBeOnTheScreen();
  expect(screen.getByText('#4')).toBeOnTheScreen();
  expect(screen.getByText('Bạn: hạng 12 · 340 XP')).toBeOnTheScreen();
  expect(screen.getByLabelText('Hạng 1, An, cấp 7, 900 XP')).toBeOnTheScreen();
  await settle();
});

it('`me.hidden` ⇒ "Bạn đang ẩn khỏi bảng xếp hạng"; "Hiện lại" ⇒ PATCH showInLeaderboard: true', async () => {
  leaderboardSpy.mockResolvedValue(board({ me: { hidden: true, rank: null, xp: 340 } }));
  privacySpy.mockResolvedValue({
    readReceipts: true,
    showGamification: true,
    showInLeaderboard: true,
    showPresence: true,
  });
  await renderScreen();

  expect(await screen.findByText('Bạn đang ẩn khỏi bảng xếp hạng')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Hiện tôi trong bảng xếp hạng nhóm' }));

  await waitFor(() => expect(privacySpy).toHaveBeenCalledWith({ showInLeaderboard: true }));
  // Đổi riêng tư xong ⇒ làm mới mọi bảng xếp hạng đã cache.
  await waitFor(() => expect(leaderboardSpy.mock.calls.length).toBeGreaterThan(1));
  await settle();
});

it('đổi kỳ ⇒ query key đổi và gọi lại theo kỳ mới', async () => {
  await renderScreen();
  await screen.findByText('Hạng 1');
  expect(leaderboardSpy).toHaveBeenLastCalledWith('ws1', 'WEEK');

  await fireEvent.press(screen.getByText('Tháng'));

  await waitFor(() => expect(leaderboardSpy).toHaveBeenLastCalledWith('ws1', 'MONTH'));
  await waitFor(() =>
    expect(queryClient.getQueryData(gamificationKeys.leaderboard('ws1', 'MONTH'))).toBeDefined(),
  );
  expect(queryClient.getQueryData(gamificationKeys.leaderboard('ws1', 'WEEK'))).toBeDefined();
  await settle();
});

it('BE trả 404 (khách/ngoài nhóm) ⇒ "Không truy cập được", không lộ nhóm có tồn tại', async () => {
  leaderboardSpy.mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
  await renderScreen();

  expect(await screen.findByText('Không truy cập được')).toBeOnTheScreen();
  await settle();
});

it('chạm một dòng ⇒ hồ sơ công khai (cấp, chuỗi, huy hiệu trưng bày)', async () => {
  publicSpy.mockResolvedValue({
    avatarAssetId: null,
    equippedItems: [],
    level: 7,
    name: 'Dũng',
    showcase: [
      {
        code: 'B1',
        description: 'Hoàn thành 50 việc',
        emoji: '💪',
        iconAssetId: null,
        id: 'b1',
        name: 'Chăm chỉ',
        rarity: 'COMMON',
        unlockedAt: '2026-09-01T00:00:00.000Z',
      },
    ],
    streak: 3,
    userId: 'u4',
  });
  await renderScreen();

  await fireEvent.press(await screen.findByLabelText('Hạng 4, Dũng, cấp 7, 600 XP'));

  await waitFor(() => expect(publicSpy).toHaveBeenCalledWith('u4'));
  expect(await screen.findByText('Cấp 7 · Chuỗi 3 ngày')).toBeOnTheScreen();
  expect(screen.getByText('Chăm chỉ')).toBeOnTheScreen();
  await settle();
});

it('hồ sơ công khai 404 (người đó tắt hiển thị) ⇒ câu trung tính', async () => {
  publicSpy.mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
  await renderScreen();

  await fireEvent.press(await screen.findByLabelText('Hạng 4, Dũng, cấp 7, 600 XP'));

  expect(
    await screen.findByText('Người này không chia sẻ hồ sơ thành tích với bạn.'),
  ).toBeOnTheScreen();
  await settle();
});
