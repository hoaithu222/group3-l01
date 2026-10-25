import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { WorkspaceListItem } from '../api';

/**
 * Đồ dùng chung cho test p3-04 của `workspaces`. KHÔNG phải test (`testMatch` chỉ nhận
 * `*.test.tsx`); `jest.mock(...)` phải nằm trong từng file test (babel-jest chỉ hoist trong file đó).
 */

/** ⚠️ `Screen`/`AppBar` gọi `useSafeAreaInsets()` — ném lỗi nếu thiếu provider. */
const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

export function makeQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

/** ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ — phải `await`. */
export async function renderWithProviders(ui: ReactElement): Promise<void> {
  const queryClient = makeQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    );
  }
  await render(ui, { wrapper: Wrapper });
}

/** Một dòng `GET /workspaces` — mặc định là mục đang CHỜ DUYỆT của một thành viên. */
export function listItem(patch: Partial<WorkspaceListItem> = {}): WorkspaceListItem {
  return {
    id: 'ws-9',
    name: 'Nhóm Toán 12',
    avatarUrl: null,
    coverUrl: null,
    coverThumbUrl: null,
    coverPreset: null,
    descriptionShort: null,
    status: 'PENDING',
    myRole: 'MEMBER',
    isFavorite: false,
    position: null,
    unreadCount: 0,
    mentionCount: 0,
    unreadAvailable: false,
    lastActivityAt: '',
    ...patch,
  };
}
