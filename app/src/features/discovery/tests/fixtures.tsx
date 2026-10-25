import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import { AxiosError } from 'axios';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type {
  PinnedItem,
  SavedAvailableItem,
  SavedUnavailableItem,
  SearchHit,
  SearchMeta,
  SearchPage,
} from '../api/discovery.types';

/** ⚠️ `Screen`/`AppBar`/`BottomSheet` gọi `useSafeAreaInsets()` — ném lỗi nếu thiếu provider. */
const SAFE_AREA_METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

export function makeQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false, staleTime: 0 } } });
}

/** ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ — phải `await`. */
export async function renderWithProviders(ui: ReactElement, queryClient: QueryClient = makeQueryClient()) {
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
export function apiError(status: number, code: string, details?: Record<string, unknown>): AxiosError {
  return new AxiosError(`HTTP ${status}`, 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: { success: false, error: { code, message: code, ...(details && { details }) } },
    headers: {},
    status,
    statusText: '',
  });
}

export function makeHit(overrides: Partial<SearchHit> = {}): SearchHit {
  return {
    messageId: 'm-1',
    seq: 1,
    threadId: null,
    parentMessageId: null,
    author: { id: 'u-an', name: 'Nguyễn Văn An', avatarUrl: null },
    createdAt: '2026-09-18T08:00:00.000Z',
    snippet: 'Họp đồ án nhóm',
    highlights: [{ start: 4, end: 9 }],
    attachmentsSummary: null,
    inThread: false,
    ...overrides,
  };
}

export function searchPage(
  hits: SearchHit[],
  meta: Partial<SearchMeta> = {},
): SearchPage {
  return { data: hits, meta: { nextCursor: null, hasMore: false, limit: 30, partial: false, ...meta } };
}

export function makeSavedItem(overrides: Partial<SavedAvailableItem> = {}): SavedAvailableItem {
  return {
    savedAt: '2026-09-18T09:00:00.000Z',
    messageId: 'm-1',
    scopeType: 'CHANNEL',
    scopeId: 'ch-1',
    workspaceId: 'ws-1',
    available: true,
    message: {
      id: 'm-1',
      authorId: 'u-an',
      authorName: 'Nguyễn Văn An',
      authorAvatarUrl: null,
      excerpt: 'Nộp báo cáo trước thứ Sáu',
      attachmentsSummary: { count: 0, kinds: [] },
      createdAt: '2026-09-18T08:00:00.000Z',
      threadId: null,
    },
    scope: { type: 'CHANNEL', id: 'ch-1', name: 'chung', isPrivate: false },
    ...overrides,
  };
}

export function makeUnavailable(messageId = 'msg-gone'): SavedUnavailableItem {
  return { savedAt: '2026-09-17T09:00:00.000Z', messageId, available: false };
}

export function makePinned(overrides: Partial<PinnedItem> = {}): PinnedItem {
  return {
    id: 'p-1',
    scopeType: 'CHANNEL',
    scopeId: 'ch-1',
    threadId: null,
    seq: 5,
    kind: 'USER',
    systemType: null,
    systemPayload: null,
    authorId: 'u-an',
    clientMessageId: null,
    content: 'Lịch bảo vệ đồ án',
    mentions: [],
    attachments: [],
    links: [],
    linkPreview: null,
    replyToId: null,
    replyPreview: null,
    forwardedFrom: null,
    reactions: [],
    pinnedAt: '2026-09-18T10:00:00.000Z',
    pinnedBy: 'u-binh',
    editedAt: null,
    version: 1,
    createdAt: '2026-09-18T08:00:00.000Z',
    deleted: false,
    deletedAt: null,
    myPermissions: {
      canEdit: false,
      canRecall: false,
      canPin: true,
      canReact: true,
      canReply: true,
      canForward: true,
      canReport: true,
      canModerate: false,
    },
    pinnedByUser: { id: 'u-binh', name: 'Trần Thị Bình' },
    ...overrides,
  };
}
