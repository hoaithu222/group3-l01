import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { gamificationService } from '../api/gamification.service';
import type { MyGamificationDto } from '../api/gamification.types';
import { ProfileGamificationBlock } from '../components/ProfileGamificationBlock';

/**
 * app.md p4-03 §3 (dòng `Me`) + §8: khối cấp/chuỗi ở thẻ hồ sơ — ẩn khi cờ `gamification` tắt (và không gọi API), skeleton khi
 * tải, ẩn khi lỗi, gợi ý cho người mới (cấp 1, 0 XP).
 */

const mockFlag = { current: true };
// `AnimatedNumber` (số cấp đếm lên) đổi state theo khung hình — ngoài `act` của test; bật "Giảm chuyển động" để số hiện NGAY.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => true,
}));
jest.mock('@/shell/capabilities', () => ({ useFeature: () => mockFlag.current }));

const profile = (overrides: Partial<MyGamificationDto> = {}): MyGamificationDto => ({
  counters: {},
  level: 12,
  levelSpan: 500,
  longestStreak: 9,
  serverNow: '2026-09-25T00:00:00.000Z',
  showcase: [],
  streak: 4,
  streakAtRisk: false,
  unseenBadges: [],
  xp: 5_000,
  xpIntoLevel: 50,
  xpToNext: 450,
  ...overrides,
});

const meSpy = jest.spyOn(gamificationService, 'me');

async function renderBlock() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<ProfileGamificationBlock />, { wrapper: Wrapper });
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockFlag.current = true;
});

it('có dữ liệu ⇒ "Cấp 12", còn N XP để lên cấp kế, chuỗi ngày', async () => {
  meSpy.mockResolvedValue(profile());
  await renderBlock();

  expect(await screen.findByText('Cấp 12')).toBeOnTheScreen();
  expect(screen.getByText('Còn 450 XP để lên cấp 13')).toBeOnTheScreen();
  expect(screen.getByText('Chuỗi 4 ngày')).toBeOnTheScreen();
  await settle();
});

it('cờ `gamification` tắt ⇒ ẩn hẳn và KHÔNG gọi API', async () => {
  mockFlag.current = false;
  meSpy.mockResolvedValue(profile());
  const view = await renderBlock();
  await settle();

  expect(view.toJSON()).toBeNull();
  expect(meSpy).not.toHaveBeenCalled();
});

it('lỗi tải ⇒ ẩn khối (không chặn màn Tôi)', async () => {
  meSpy.mockRejectedValue(new Error('mạng'));
  const view = await renderBlock();
  await settle();

  expect(view.toJSON()).toBeNull();
});

it('cấp 1, 0 XP ⇒ gợi ý "Hoàn thành việc đầu tiên để nhận XP"', async () => {
  meSpy.mockResolvedValue(profile({ level: 1, streak: 0, xp: 0, xpIntoLevel: 0, xpToNext: 100 }));
  await renderBlock();

  expect(await screen.findByText('Hoàn thành việc đầu tiên để nhận XP')).toBeOnTheScreen();
  await settle();
});
