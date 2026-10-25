import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';
import { AxiosError } from 'axios';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { MessageExtensionMessage, MessageExtensionScope } from '@/shared/message-extensions';

import type {
  AnnouncementView,
  ReceiptItem,
  ReceiptsMeta,
  ReceiptsPage,
} from '../api/announcements.types';

/** ⚠️ `Screen`/`AppBar`/`BottomSheet` gọi `useSafeAreaInsets()` — ném lỗi nếu thiếu provider. */
const SAFE_AREA_METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false, staleTime: 0 } },
  });
}

/**
 * Cho React Query đẩy kết quả mutation vào React: nó báo observer qua `setTimeout(0)`, mà cập nhật ngoài `act` thì RNTL cảnh
 * báo "not wrapped in act" — nên sau khi một mutation KẾT THÚC trong test, chờ một nhịp macrotask TRONG `act`.
 */
export const flushQuery = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

/** ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ — phải `await`. */
export async function renderWithProviders(
  ui: ReactElement,
  queryClient: QueryClient = makeQueryClient(),
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    );
  }
  const result = await render(ui, { wrapper: Wrapper });
  return { ...result, queryClient };
}

/** Lỗi HTTP có thân `{ error: { code, details } }` như `errorHandler` của BE. */
export function apiError(status: number, code: string): AxiosError {
  return new AxiosError(`HTTP ${status}`, 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: { success: false, error: { code, message: code } },
    headers: {},
    status,
    statusText: '',
  });
}

export function makeView(overrides: Partial<AnnouncementView> = {}): AnnouncementView {
  return {
    canViewReceipts: false,
    channelId: 'ch-1',
    confirmedByMe: false,
    createdAt: '2026-09-25T00:00:00.000Z',
    deadlineAt: null,
    expired: false,
    messageId: 'm-1',
    requestedBy: 'u-admin',
    ...overrides,
  };
}

export function makeMessage(
  overrides: Partial<MessageExtensionMessage> = {},
): MessageExtensionMessage {
  return {
    authorId: 'u-admin',
    deleted: false,
    id: 'm-1',
    kind: 'USER',
    threadId: null,
    ...overrides,
  };
}

export function makeScope(overrides: Partial<MessageExtensionScope> = {}): MessageExtensionScope {
  return { scopeId: 'ch-1', scopeType: 'CHANNEL', workspaceId: 'ws-1', ...overrides };
}

export function makeReceipt(name: string, overrides: Partial<ReceiptItem> = {}): ReceiptItem {
  return { avatarUrl: null, name, userId: `u-${name}`, ...overrides };
}

export function receiptsPage(items: ReceiptItem[], meta: Partial<ReceiptsMeta> = {}): ReceiptsPage {
  return {
    data: items,
    meta: {
      audienceCount: 40,
      confirmedCount: 12,
      hasMore: false,
      limit: 30,
      nextCursor: null,
      ...meta,
    },
  };
}
