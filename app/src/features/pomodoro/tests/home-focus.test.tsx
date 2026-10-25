import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { HomeWidgetsSlot } from '@/shared/home-widgets';

import { pomodoroService } from '../api/pomodoro.service';
import type { PomodoroHistoryItem, PomodoroHistoryPage } from '../api/pomodoro.types';
import { HomeFocusWidget } from '../components/home/HomeFocusWidget';
import { collectHistorySince, weekWindowStart } from '../components/home/week-focus';
// Tác dụng phụ: đăng ký widget vào khe (giống `app/(app)/_layout.tsx`).
import '../register-home-widgets';
import { makeSnapshot } from './fixtures';

/**
 * Widget "Giờ tập trung" ở Trang chủ (H2): `collectHistorySince` + hành vi widget (ẩn khi cờ `pomodoro` tắt, lỗi, hoặc tuần này chưa
 * có phiên nào); hàm thuần `weekFocus` ở `week-focus.test.ts`. Thời điểm dựng bằng `new Date(y, m, d, h)` (giờ địa phương).
 * Không dùng `./helpers` (kéo cả socket mock) — widget chỉ cần React Query.
 */

const mockFlag = { current: true };
// `AnimatedNumber` (tổng giờ đếm lên) đổi state theo khung hình — ngoài `act` của test; bật "Giảm chuyển động" để số hiện NGAY.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => true,
}));
jest.mock('@/shell/capabilities', () => ({ useFeature: () => mockFlag.current }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useIsFocused: jest.fn(() => true),
}));

const historySpy = jest.spyOn(pomodoroService, 'history');

const NOW = new Date(2026, 8, 26, 10, 0); // Thứ Bảy 26/09/2026

const joinedAt = (dayOfMonth: number, hour: number): string =>
  new Date(2026, 8, dayOfMonth, hour, 0).toISOString();

function historyItem(over: Partial<PomodoroHistoryItem> = {}): PomodoroHistoryItem {
  return {
    channelId: 'ch1',
    channelName: 'Phòng học đêm',
    completedFocusCycles: 4,
    config: makeSnapshot().config,
    cyclesAttended: 2,
    endReason: null,
    endedAt: null,
    goal: null,
    interruptions: 0,
    joinedAt: new Date().toISOString(),
    leftAt: null,
    presentSeconds: 3600,
    sessionId: 's1',
    skippedFocusCycles: 0,
    startedAt: null,
    status: 'ENDED',
    workspaceId: 'ws1',
    ...over,
  };
}

const page = (
  items: PomodoroHistoryItem[],
  nextCursor: string | null = null,
): PomodoroHistoryPage => ({
  items,
  meta: { hasMore: nextCursor !== null, limit: 50, nextCursor },
});

describe('collectHistorySince', () => {
  const since = weekWindowStart(NOW);

  it('đọc nhiều trang tới khi gặp lượt cũ hơn cửa sổ rồi dừng', async () => {
    const fetchPage = jest
      .fn<Promise<PomodoroHistoryPage>, [string | undefined]>()
      .mockResolvedValueOnce(
        page([historyItem({ joinedAt: joinedAt(26, 9), sessionId: 'a' })], 'c1'),
      )
      .mockResolvedValueOnce(
        page(
          [
            historyItem({ joinedAt: joinedAt(21, 9), sessionId: 'b' }),
            historyItem({ joinedAt: joinedAt(15, 9), sessionId: 'cũ' }),
          ],
          'c2',
        ),
      );

    const items = await collectHistorySince(fetchPage, since, 4);

    expect(items.map((i) => i.sessionId)).toEqual(['a', 'b']);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 'c1');
  });

  it('không quá `maxPages` trang dù còn dữ liệu', async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValue(page([historyItem({ joinedAt: joinedAt(26, 9) })], 'tiếp'));

    await collectHistorySince(fetchPage, since, 3);

    expect(fetchPage).toHaveBeenCalledTimes(3);
  });
});

describe('HomeFocusWidget', () => {
  async function renderWidget(ui = <HomeFocusWidget />) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity, retry: false, staleTime: 0 } },
    });
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return render(ui, { wrapper: Wrapper });
  }
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFlag.current = true;
    historySpy.mockResolvedValue(
      page([
        historyItem({ cyclesAttended: 2, presentSeconds: 85 * 60, sessionId: 'a' }),
        historyItem({ cyclesAttended: 1, presentSeconds: 35 * 60, sessionId: 'b' }),
      ]),
    );
  });

  it('tổng giờ, số vòng, số phiên; "Lịch sử" mở /me/pomodoro-history', async () => {
    await renderWidget();

    expect(await screen.findByText('2 giờ')).toBeOnTheScreen();
    expect(screen.getByText('Giờ tập trung')).toBeOnTheScreen();
    expect(screen.getByText('3 vòng tập trung · 2 phiên')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Xem lịch sử học Pomodoro' }));
    expect(router.push).toHaveBeenCalledWith('/me/pomodoro-history');
    await settle();
  });

  it('cờ `pomodoro` tắt ⇒ ẩn hẳn và KHÔNG gọi API', async () => {
    mockFlag.current = false;
    const view = await renderWidget();
    await settle();

    expect(view.toJSON()).toBeNull();
    expect(historySpy).not.toHaveBeenCalled();
  });

  it('tuần này chưa có phiên nào ⇒ ẩn', async () => {
    historySpy.mockResolvedValue(page([historyItem({ joinedAt: joinedAt(1, 9) })]));
    const view = await renderWidget();
    await settle();

    expect(view.toJSON()).toBeNull();
  });

  it('lỗi tải ⇒ ẩn (không lỗi ồn ào trên Trang chủ)', async () => {
    historySpy.mockRejectedValue(new Error('mạng'));
    const view = await renderWidget();
    await settle();

    expect(view.toJSON()).toBeNull();
  });

  it('đăng ký ở `register-home-widgets` ⇒ hiện qua khe Trang chủ', async () => {
    await renderWidget(<HomeWidgetsSlot />);

    expect(await screen.findByText('2 giờ')).toBeOnTheScreen();
    await settle();
  });
});
