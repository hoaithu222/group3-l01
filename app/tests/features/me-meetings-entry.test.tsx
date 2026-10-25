import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MeScreen } from '@/features/me/screens/MeScreen';
import { useFeature } from '@/shell/capabilities';
import { PATHS } from '@/shell/config';

/**
 * Lối vào "Lịch họp" từ màn Tôi (p2-04): hàng chỉ hiện khi cờ `meeting` bật (giống các hàng Học/Thành tích cạnh nó) và mở `/meetings`.
 * Cờ tắt hoặc capabilities chưa tải (`useFeature` ≠ `true`) ⇒ không có hàng — không lộ phân hệ chưa bật.
 */
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn() }));
jest.mock('@/shell/session/useLogout', () => ({
  useLogout: () => ({ isPending: false, logout: jest.fn() }),
}));

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

/** Bật đúng các cờ được nêu, tắt phần còn lại. */
function enable(...flags: string[]) {
  jest.mocked(useFeature).mockImplementation((flag: string) => flags.includes(flag));
}

/**
 * ⚠️ `QueryClientProvider` BẮT BUỘC: thẻ hồ sơ có avatar đổi được (`MeAvatarPicker` → `useAvatarUpload` → `useMutation`) —
 * thiếu nó là cả màn ném "No QueryClient set" trước khi tới được hàng "Lịch họp".
 */
async function renderMe() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <MeScreen />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

describe('MeScreen — hàng "Lịch họp"', () => {
  it('cờ `meeting` bật ⇒ có hàng "Lịch họp", bấm mở màn lịch', async () => {
    enable('meeting');
    await renderMe();

    await fireEvent.press(screen.getByText('Lịch họp'));
    expect(router.push).toHaveBeenCalledWith(PATHS.MEETINGS);
  });

  it('cờ `meeting` tắt ⇒ không có hàng, các hàng khác vẫn nguyên', async () => {
    enable('study');
    await renderMe();

    expect(screen.queryByText('Lịch họp')).toBeNull();
    expect(screen.getByText('Học tập của tôi')).toBeOnTheScreen();
    expect(screen.getByText('Đã lưu')).toBeOnTheScreen();
  });
});
