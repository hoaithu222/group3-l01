import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { showToast } from '@/shared/utils/toast.utils';

import { gamificationService } from '../api/gamification.service';
import type { BadgeDto, MyGamificationDto } from '../api/gamification.types';
import { BadgeDetailSheet } from '../components/BadgeDetailSheet';
import { gamificationKeys } from '../queries/gamification.keys';

/**
 * app.md p4-03 §8: BadgeDetailSheet — `GAME_006` hiện thông điệp tiếng Việt; huy hiệu chưa đạt ghi điều kiện bằng chữ
 * và không có nút Trưng bày; showcase đầy ⇒ khoá nút.
 */

jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/shell/capabilities', () => ({ useFeature: () => true }));
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
  rarity: 'RARE',
  unlockedAt: '2026-09-01T00:00:00.000Z',
  ...overrides,
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

async function renderSheet(target: BadgeDto, showcase: BadgeDto[] = []) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { gcTime: 0 }, queries: { gcTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(gamificationKeys.me(), profile(showcase));
  const onClose = jest.fn();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  await render(<BadgeDetailSheet badge={target} onClose={onClose} />, { wrapper: Wrapper });
  return { onClose };
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

beforeEach(() => jest.clearAllMocks());

it('GAME_006 khi lưu ⇒ toast câu tiếng Việt của feature, sheet KHÔNG đóng', async () => {
  showcaseSpy.mockRejectedValue({
    isAxiosError: true,
    response: { data: { error: { code: 'GAME_006' } }, status: 400 },
  });
  const { onClose } = await renderSheet(badge('b1'));

  await fireEvent.press(screen.getByRole('button', { name: 'Trưng bày' }));

  await waitFor(() =>
    expect(mockedToast).toHaveBeenCalledWith(
      'error',
      'Chỉ trưng bày được huy hiệu bạn đã đạt, tối đa 6 huy hiệu',
    ),
  );
  expect(showcaseSpy).toHaveBeenCalledWith(['b1']);
  expect(onClose).not.toHaveBeenCalled();
  await settle();
});

it('trưng bày thành công ⇒ thêm vào CUỐI danh sách hiện tại, toast + đóng sheet', async () => {
  showcaseSpy.mockResolvedValue({ showcase: [] });
  const { onClose } = await renderSheet(badge('b3'), [badge('b1'), badge('b2')]);

  await fireEvent.press(screen.getByRole('button', { name: 'Trưng bày' }));

  await waitFor(() => expect(showcaseSpy).toHaveBeenCalledWith(['b1', 'b2', 'b3']));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(mockedToast).toHaveBeenCalledWith('success', 'Đã trưng bày huy hiệu');
  await settle();
});

it('huy hiệu đang trưng bày ⇒ nút "Bỏ trưng bày" gửi danh sách đã bỏ nó', async () => {
  showcaseSpy.mockResolvedValue({ showcase: [] });
  await renderSheet(badge('b2'), [badge('b1'), badge('b2')]);

  await fireEvent.press(screen.getByRole('button', { name: 'Bỏ trưng bày' }));

  await waitFor(() => expect(showcaseSpy).toHaveBeenCalledWith(['b1']));
  await settle();
});

it('trưng bày đủ 6 ⇒ khoá nút và giải thích bằng chữ', async () => {
  const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => badge(id));
  await renderSheet(badge('g'), six);

  expect(screen.getByRole('button', { name: 'Trưng bày' })).toBeDisabled();
  expect(screen.getByText(/Đã trưng bày đủ 6 huy hiệu/)).toBeOnTheScreen();
  await settle();
});

it('chưa đạt ⇒ ghi tiến độ từng điều kiện bằng chữ và KHÔNG có nút Trưng bày', async () => {
  await renderSheet(
    badge('b9', {
      progress: [
        { counter: 'tasksDone', current: 32, target: 50 },
        { counter: 'srReviewDays', current: 7, target: 7 },
      ],
      unlockedAt: undefined,
    }),
  );

  expect(screen.getByText('Điều kiện để đạt')).toBeOnTheScreen();
  expect(screen.getByText('Công việc hoàn thành: 32/50')).toBeOnTheScreen();
  expect(screen.getByText('Ngày ôn tập: 7/7')).toBeOnTheScreen();
  expect(screen.getByText('Chưa đạt · 32/50')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Trưng bày' })).toBeNull();
  await settle();
});
