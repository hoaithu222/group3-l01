import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { getPushPermission } from '@/core/notifications';
import { useAuthStore } from '@/shell/store/slices/auth';

import { PushPrimerHost } from '../PushPrimerHost';
import { PRIMER_SNOOZE_DAYS, primerStorageKey, usePushPrimerStore } from '../push-primer';
import { usePushPermission } from '../usePushPermission';

/**
 * Tấm primer (`app.md` §3): hiện khi người dùng mở hội thoại/vào nhóm lần đầu, "Bật" gọi hộp thoại hệ thống,
 * "Để sau" giữ 7 ngày; không hiện ở màn khác và không hiện khi đã cấp/đã từ chối.
 */

jest.mock('expo-router', () => ({ usePathname: jest.fn() }));
jest.mock('@/core/notifications', () => ({ getPushPermission: jest.fn() }));
jest.mock('../usePushPermission', () => ({ usePushPermission: jest.fn() }));

const mockedPathname = jest.mocked(usePathname);
const mockedPermission = jest.mocked(getPushPermission);
const mockedEnable = jest.fn(async () => 'granted' as const);

const SAFE_AREA_METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function Wrapper({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{children}</SafeAreaProvider>;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  usePushPrimerStore.setState({ visible: false });
  useAuthStore.setState({ status: 'authenticated', token: 'jwt', user: { id: 'u-1' } as never });
  mockedPermission.mockResolvedValue('undetermined');
  jest.mocked(usePushPermission).mockReturnValue({
    enable: mockedEnable,
    openSettings: jest.fn(),
    permission: 'undetermined',
  } as never);
});

afterAll(() => {
  useAuthStore.setState({ status: 'anonymous', token: null, user: null });
});

describe('PushPrimerHost', () => {
  it('mở một hội thoại → hiện tấm mời bật thông báo', async () => {
    mockedPathname.mockReturnValue('/messages/conv-1');
    await render(<PushPrimerHost />, { wrapper: Wrapper });

    expect(await screen.findByText('Để sau')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Bật thông báo' })).toBeOnTheScreen();
  });

  it('ở màn không liên quan (Tôi, Hoạt động) → KHÔNG hiện — không hỏi lúc onboarding/mở app', async () => {
    mockedPathname.mockReturnValue('/me');
    await render(<PushPrimerHost />, { wrapper: Wrapper });

    await waitFor(() => expect(mockedPermission).not.toHaveBeenCalled());
    expect(screen.queryByText('Để sau')).toBeNull();
  });

  it('quyền đã cấp → không hiện dù đang ở hội thoại', async () => {
    mockedPermission.mockResolvedValue('granted');
    mockedPathname.mockReturnValue('/messages/conv-1');
    await render(<PushPrimerHost />, { wrapper: Wrapper });

    await waitFor(() => expect(mockedPermission).toHaveBeenCalled());
    expect(screen.queryByText('Để sau')).toBeNull();
  });

  it('"Để sau" → đóng tấm và ghi mốc +7 ngày, không xin quyền', async () => {
    mockedPathname.mockReturnValue('/messages/conv-1');
    await render(<PushPrimerHost />, { wrapper: Wrapper });

    const before = Date.now();
    await fireEvent.press(await screen.findByText('Để sau'));

    await waitFor(() => expect(screen.queryByText('Để sau')).toBeNull());
    expect(mockedEnable).not.toHaveBeenCalled();

    const stored = JSON.parse((await AsyncStorage.getItem(primerStorageKey('u-1'))) ?? '{}') as {
      dismissedUntil: number;
    };
    expect(stored.dismissedUntil).toBeGreaterThanOrEqual(before + PRIMER_SNOOZE_DAYS * 86_400_000);
  });

  it('"Bật thông báo" → đóng tấm, gọi hộp thoại hệ thống, và cũng ghi mốc để không hỏi lại ngay', async () => {
    mockedPathname.mockReturnValue('/messages/conv-1');
    await render(<PushPrimerHost />, { wrapper: Wrapper });

    await fireEvent.press(await screen.findByRole('button', { name: 'Bật thông báo' }));

    expect(mockedEnable).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('Để sau')).toBeNull());
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(primerStorageKey('u-1'))).not.toBeNull(),
    );
  });
});
