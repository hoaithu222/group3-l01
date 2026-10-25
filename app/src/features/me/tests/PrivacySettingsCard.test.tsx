import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { PrivacySettingsCard } from '@/features/me/components/PrivacySettingsCard';
import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

/**
 * `PrivacySettingsCard` — hai công tắc ĐỔI-TỨC-THÌ (p0-01 mục 10).
 *
 * `value` đọc THẲNG từ `user.privacy` trong store (giống `BiometricSettingRow`
 * đọc `binding`) nên "rollback khi lỗi" không cần code riêng: lỗi thì store
 * không đổi, công tắc tự đứng nguyên ở giá trị cũ — ca thứ ba dưới đây xác
 * nhận đúng hành vi đó.
 */

jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
const mockedToast = jest.mocked(showToast);

const mockedUpdatePrivacy = jest.fn();
jest.mock('@/core/api/auth', () => {
  const actual = jest.requireActual('@/core/api/auth');
  return {
    ...actual,
    authService: {
      ...actual.authService,
      updatePrivacy: (...args: unknown[]) => mockedUpdatePrivacy(...args),
    },
  };
});

async function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<PrivacySettingsCard />, { wrapper: Wrapper });
}

/**
 * Phần tử thứ `index` trong danh sách — thứ tự công tắc vẽ ra: 0 = "Đã xem
 * tin nhắn", 1 = "Trạng thái hoạt động" (xem `PrivacySettingsCard.tsx`).
 *
 * ⚠️ `items[index]` có kiểu `T | undefined` vì `noUncheckedIndexedAccess`
 * đang bật. ⛔ Đừng dập bằng `!` — ném lỗi nói rõ đang thiếu phần tử nào thì
 * test đỏ dễ hiểu hơn nhiều so với một `undefined` trôi tới tận `fireEvent.press`.
 */
function elementAt<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Không tìm thấy phần tử thứ ${String(index)}`);
  return item;
}

function seedUser(privacy: { readReceipts: boolean; showPresence: boolean } | null): void {
  useAuthStore.getState().setAuth({
    token: 'token',
    user: {
      email: 'nguoi-dung@vidu.com',
      id: 'user-1',
      name: 'Người dùng',
      permissions: [],
      privacy,
      roles: [],
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  seedUser({ readReceipts: true, showPresence: true });
});

it('privacy null/thiếu ⇒ mặc định BẬT cả hai công tắc', async () => {
  seedUser(null);
  await renderCard();

  const toggles = await screen.findAllByRole('switch');
  expect(toggles).toHaveLength(2);
  toggles.forEach((toggle) => expect(toggle.props.accessibilityState.checked).toBe(true));
});

it('bấm công tắc "Đã xem tin nhắn" ⇒ gọi updatePrivacy đúng field, store đổi theo phản hồi', async () => {
  mockedUpdatePrivacy.mockResolvedValue({ readReceipts: false, showPresence: true });

  await renderCard();
  const toggles = await screen.findAllByRole('switch');
  await fireEvent.press(elementAt(toggles, 0));

  await waitFor(() => expect(mockedUpdatePrivacy).toHaveBeenCalledWith({ readReceipts: false }));
  await waitFor(() => expect(useAuthStore.getState().user?.privacy?.readReceipts).toBe(false));
});

it('lỗi ⇒ toast báo lỗi, giá trị KHÔNG đổi (rollback tự nhiên vì store không ghi)', async () => {
  mockedUpdatePrivacy.mockRejectedValue(new Error('mạng chập chờn'));

  await renderCard();
  const toggles = await screen.findAllByRole('switch');
  await fireEvent.press(elementAt(toggles, 1));

  await waitFor(() => expect(mockedToast).toHaveBeenCalledWith('error', 'mạng chập chờn'));
  expect(useAuthStore.getState().user?.privacy?.showPresence).toBe(true);
});
