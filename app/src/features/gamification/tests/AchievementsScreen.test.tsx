import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { showToast } from '@/shared/utils/toast.utils';

import { gamificationService } from '../api/gamification.service';
import type { BadgeDto, MyGamificationDto } from '../api/gamification.types';
import { gamificationKeys } from '../queries/gamification.keys';
import { AchievementsScreen } from '../screens/AchievementsScreen';

/**
 * app.md p4-03 §3/§9: màn Thành tích — sắp thứ tự trưng bày (Lên/Xuống) rồi lưu ĐÚNG thứ tự; trần 6; bấm ô huy hiệu mở chi
 * tiết. (Công tắc riêng tư: `GamificationPrivacyCard.test.tsx`.)
 */

// `AnimatedNumber` (số cấp/chuỗi đếm lên) đổi state theo khung hình — ngoài `act` của test; bật "Giảm chuyển động" để số hiện NGAY.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => true,
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/shell/capabilities', () => ({ useFeature: () => true }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
const mockedToast = jest.mocked(showToast);

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

const badge = (id: string, overrides: Partial<BadgeDto> = {}): BadgeDto => ({
  code: id.toUpperCase(),
  description: `Mô tả ${id}`,
  emoji: '💪',
  iconAssetId: null,
  id,
  name: `Huy hiệu ${id}`,
  rarity: 'COMMON',
  unlockedAt: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

const B1 = badge('b1');
const B2 = badge('b2');
const B3 = badge('b3');
const LOCKED = badge('b4', {
  progress: [{ counter: 'tasksDone', current: 32, target: 50 }],
  unlockedAt: undefined,
});

const profile = (showcase: BadgeDto[]): MyGamificationDto => ({
  counters: {},
  level: 3,
  levelSpan: 300,
  longestStreak: 2,
  serverNow: '2026-09-25T00:00:00.000Z',
  showcase,
  streak: 1,
  streakAtRisk: false,
  unseenBadges: [],
  xp: 500,
  xpIntoLevel: 20,
  xpToNext: 280,
});

const showcaseSpy = jest.spyOn(gamificationService, 'setShowcase');

async function renderScreen(
  showcase: BadgeDto[] = [B1, B2],
  catalog: BadgeDto[] = [B1, B2, B3, LOCKED],
) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { gcTime: 0 }, queries: { gcTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(gamificationKeys.me(), profile(showcase));
  queryClient.setQueryData(gamificationKeys.badges(), catalog);
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(<AchievementsScreen />, { wrapper: Wrapper });
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

beforeEach(() => {
  jest.clearAllMocks();
});

it('chỉnh trưng bày: đổi thứ tự bằng nút, thêm một huy hiệu, Lưu ⇒ PUT đúng thứ tự', async () => {
  showcaseSpy.mockResolvedValue({ showcase: [B2, B1, B3] });
  await renderScreen();

  await fireEvent.press(await screen.findByRole('button', { name: 'Chỉnh trưng bày' }));
  // b1 đang đứng đầu ⇒ nút "lên" của nó khoá; đưa b1 xuống ⇒ [b2, b1].
  expect(screen.getByRole('button', { name: 'Đưa Huy hiệu b1 lên trước' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Đưa Huy hiệu b1 xuống sau' }));
  // Chọn thêm b3 ở danh sách "Đã đạt" ⇒ nối vào cuối.
  await fireEvent.press(screen.getByLabelText(/^Huy hiệu b3, .*chưa trưng bày$/));
  expect(screen.getByText('Đang trưng bày (3/6)')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Lưu' }));

  await waitFor(() => expect(showcaseSpy).toHaveBeenCalledWith(['b2', 'b1', 'b3']));
  await waitFor(() =>
    expect(mockedToast).toHaveBeenCalledWith('success', 'Đã cập nhật huy hiệu trưng bày'),
  );
  await settle();
});

it('đã đủ 6 ở bản nháp ⇒ chọn thêm bị chặn bằng cảnh báo, danh sách vẫn 6', async () => {
  const six = ['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => badge(id));
  await renderScreen(six, [...six, B3]);
  await fireEvent.press(await screen.findByRole('button', { name: 'Chỉnh trưng bày' }));
  expect(screen.getByText('Đang trưng bày (6/6)')).toBeOnTheScreen();

  await fireEvent.press(screen.getByLabelText(/^Huy hiệu b3, .*chưa trưng bày$/));

  expect(mockedToast).toHaveBeenCalledWith('warning', 'Chỉ trưng bày tối đa 6 huy hiệu');
  expect(screen.getByText('Đang trưng bày (6/6)')).toBeOnTheScreen();
  await settle();
});

it('bấm một ô huy hiệu (ngoài chế độ chỉnh) ⇒ mở chi tiết; chưa đạt hiện tiến độ bằng chữ', async () => {
  await renderScreen();

  await fireEvent.press(await screen.findByLabelText(/^Huy hiệu b4, Phổ biến, Chưa đạt · 32\/50/));

  expect(await screen.findByText('Điều kiện để đạt')).toBeOnTheScreen();
  expect(screen.getByText('Công việc hoàn thành: 32/50')).toBeOnTheScreen();
  await settle();
});
