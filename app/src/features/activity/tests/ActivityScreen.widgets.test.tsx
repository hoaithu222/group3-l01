import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { inboxService } from '@/core/notifications';
import { registerActivityWidget, resetActivityWidgets } from '@/shared/activity-widgets';

import { activityService } from '../api/activity.service';
import { ActivityScreen } from '../screens/ActivityScreen';

/**
 * Khe widget ở ĐẦU tab Hoạt động (p4-02 + p4-05): widget do feature khác đăng ký hiện KỂ CẢ khi hộp thư rỗng (số "N thẻ cần chấm" không phụ
 * thuộc thông báo nào), và không có widget nào thì màn giữ nguyên như cũ.
 */
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/shell/capabilities', () => ({ useFeature: () => true }));

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

async function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: 0 },
      queries: { gcTime: Infinity, retry: false, staleTime: 0 },
    },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(<ActivityScreen />, { wrapper: Wrapper });
}

beforeEach(() => {
  jest
    .spyOn(inboxService, 'list')
    .mockResolvedValue({ data: [], meta: { hasMore: false, limit: 30, nextCursor: null } });
  jest.spyOn(activityService, 'listWorkspaces').mockResolvedValue([]);
});
afterEach(() => resetActivityWidgets());

describe('ActivityScreen — widget đầu tab', () => {
  it('widget đã đăng ký hiện cùng hộp thư rỗng', async () => {
    registerActivityWidget('test.widget', () => <Text>3 thẻ cần chấm</Text>);
    await renderScreen();

    expect(await screen.findByText('Chưa có hoạt động cần chú ý')).toBeOnTheScreen();
    expect(screen.getByText('3 thẻ cần chấm')).toBeOnTheScreen();
  });

  it('chưa đăng ký widget nào → chỉ có hộp thư', async () => {
    await renderScreen();

    expect(await screen.findByText('Chưa có hoạt động cần chú ý')).toBeOnTheScreen();
    expect(screen.queryByText('3 thẻ cần chấm')).toBeNull();
  });
});
