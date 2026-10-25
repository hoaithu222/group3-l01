import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

import { gamificationService } from '../api/gamification.service';
import { GamificationPrivacyCard } from '../components/GamificationPrivacyCard';

/**
 * app.md p4-03 §3 `Privacy`: hai công tắc `showInLeaderboard`/`showGamification` — mặc định BẬT khi `privacy` null, đổi LẠC
 * QUAN trên `user.privacy` của store phiên (giữ nguyên hai công tắc của p0-01), lỗi ⇒ trả giá trị cũ + toast.
 */

jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
const mockedToast = jest.mocked(showToast);

const privacySpy = jest.spyOn(gamificationService, 'updatePrivacy');

async function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { gcTime: 0 }, queries: { gcTime: Infinity, retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<GamificationPrivacyCard />, { wrapper: Wrapper });
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

function seedPrivacy(privacy: object | null): void {
  useAuthStore.getState().setAuth({
    token: 'token',
    user: {
      email: 'a@b.c',
      id: 'user-1',
      name: 'Tôi',
      permissions: [],
      privacy: privacy as never,
      roles: [],
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  seedPrivacy(null);
});

it('mặc định BẬT cả hai khi `privacy` null; tắt một công tắc ⇒ PATCH đúng trường, đổi lạc quan', async () => {
  let resolve: (value: never) => void = () => undefined;
  privacySpy.mockImplementation(
    () =>
      new Promise((res) => {
        resolve = res as never;
      }),
  );
  await renderCard();

  const toggles = await screen.findAllByRole('switch');
  expect(toggles).toHaveLength(2);
  toggles.forEach((toggle) => expect(toggle.props.accessibilityState.checked).toBe(true));

  await fireEvent.press(toggles[0] as (typeof toggles)[number]);

  await waitFor(() => expect(privacySpy).toHaveBeenCalledWith({ showInLeaderboard: false }));
  // Lạc quan: chưa có phản hồi mà store đã đổi; hai công tắc p0-01 (readReceipts, showPresence) không bị mất.
  const optimistic = useAuthStore.getState().user?.privacy as Record<string, unknown>;
  expect(optimistic.showInLeaderboard).toBe(false);
  expect(optimistic.readReceipts).toBe(true);
  expect(optimistic.showPresence).toBe(true);

  await act(async () => {
    resolve({
      readReceipts: true,
      showGamification: true,
      showInLeaderboard: false,
      showPresence: true,
    } as never);
  });
  await settle();
});

it('lỗi ⇒ trả về giá trị cũ + toast', async () => {
  seedPrivacy({
    readReceipts: true,
    showGamification: true,
    showInLeaderboard: true,
    showPresence: true,
  });
  privacySpy.mockRejectedValue(new Error('mạng chập chờn'));
  await renderCard();

  const toggles = await screen.findAllByRole('switch');
  await fireEvent.press(toggles[1] as (typeof toggles)[number]);

  await waitFor(() =>
    expect(mockedToast).toHaveBeenCalledWith('error', 'Chưa lưu được cài đặt riêng tư, thử lại'),
  );
  const privacy = useAuthStore.getState().user?.privacy as Record<string, unknown>;
  expect(privacy.showGamification).toBe(true);
  await settle();
});

it('`privacy` đã lưu `false` ⇒ công tắc hiện TẮT (không coi false là mặc định)', async () => {
  seedPrivacy({
    readReceipts: true,
    showGamification: false,
    showInLeaderboard: false,
    showPresence: true,
  });
  await renderCard();

  const toggles = await screen.findAllByRole('switch');
  toggles.forEach((toggle) => expect(toggle.props.accessibilityState.checked).toBe(false));
});
