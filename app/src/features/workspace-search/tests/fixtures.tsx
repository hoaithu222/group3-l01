import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import { AxiosError } from 'axios';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type {
  ChannelHit,
  FileHit,
  MeetingHit,
  MessageHit,
  PersonHit,
  SearchRow,
  WorkspaceSearchMeta,
  WorkspaceSearchPage,
} from '../api';

/** ⚠️ `Screen`/`AppBar`/`BottomSheet` gọi `useSafeAreaInsets()` — ném lỗi nếu thiếu provider. */
const SAFE_AREA_METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false, staleTime: 0 } },
  });
}

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
export function apiError(
  status: number,
  code: string,
  details?: Record<string, unknown>,
): AxiosError {
  return new AxiosError(`HTTP ${status}`, 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: { success: false, error: { code, message: code, ...(details && { details }) } },
    headers: {},
    status,
    statusText: '',
  });
}

export function makeMessageHit(overrides: Partial<MessageHit> = {}): MessageHit {
  return {
    messageId: 'm-1',
    seq: 1,
    scope: { type: 'CHANNEL', id: 'ch-1', name: 'chung', isPrivate: false },
    threadId: null,
    parentMessageId: null,
    inThread: false,
    author: { id: 'u-an', name: 'Nguyễn Văn An', avatarUrl: null },
    snippet: 'Họp đồ án nhóm',
    highlights: [{ start: 4, end: 9 }],
    createdAt: '2026-09-18T08:00:00.000Z',
    hasAttachments: false,
    ...overrides,
  };
}

export function makeFileHit(overrides: Partial<FileHit> = {}): FileHit {
  return {
    assetId: 'a-1',
    name: 'de-cuong.pdf',
    mime: 'application/pdf',
    size: 1536,
    kind: 'FILE',
    source: {
      kind: 'MESSAGE',
      messageId: 'm-1',
      scope: { type: 'CHANNEL', id: 'ch-1', name: 'chung', isPrivate: false },
    },
    createdAt: '2026-09-18T08:00:00.000Z',
    ...overrides,
  };
}

export function makeChannelHit(overrides: Partial<ChannelHit> = {}): ChannelHit {
  return {
    channelId: 'ch-2',
    name: 'do-an',
    type: 'TEXT',
    visibility: 'PUBLIC',
    status: 'ACTIVE',
    joined: true,
    memberCount: 12,
    ...overrides,
  };
}

export function makePersonHit(overrides: Partial<PersonHit> = {}): PersonHit {
  return {
    userId: 'u-an',
    displayName: 'Nguyễn Văn An',
    avatarUrl: null,
    role: 'MEMBER',
    presence: 'ONLINE',
    ...overrides,
  };
}

export function makeMeetingHit(overrides: Partial<MeetingHit> = {}): MeetingHit {
  return {
    meetingId: 'mt-1',
    code: 'ABC-123',
    title: 'Họp đồ án tuần 3',
    startAt: '2026-09-25T02:00:00.000Z',
    endAt: '2026-09-25T03:00:00.000Z',
    status: 'SCHEDULED',
    isAttendee: true,
    ...overrides,
  };
}

const META: WorkspaceSearchMeta = {
  nextCursor: null,
  hasMore: false,
  limit: 30,
  partial: false,
  truncated: false,
};

export function meta(overrides: Partial<WorkspaceSearchMeta> = {}): WorkspaceSearchMeta {
  return { ...META, ...overrides };
}

/** Trang kết quả TIN — dựng `SearchRow` đúng như `workspaceSearchService.search` (service bị mock nên phải tự gắn loại + khoá). */
export function messagePage(
  hits: MessageHit[],
  overrides: Partial<WorkspaceSearchMeta> = {},
): WorkspaceSearchPage {
  const data: SearchRow[] = hits.map((hit) => ({ type: 'messages', key: hit.messageId, hit }));
  return { data, meta: meta(overrides) };
}

export function filePage(
  hits: FileHit[],
  overrides: Partial<WorkspaceSearchMeta> = {},
): WorkspaceSearchPage {
  const data: SearchRow[] = hits.map((hit) => ({
    type: 'files',
    key: `${hit.source.messageId ?? hit.source.resourceId ?? ''}:${hit.assetId}`,
    hit,
  }));
  return { data, meta: meta(overrides) };
}

export function channelPage(
  hits: ChannelHit[],
  overrides: Partial<WorkspaceSearchMeta> = {},
): WorkspaceSearchPage {
  const data: SearchRow[] = hits.map((hit) => ({ type: 'channels', key: hit.channelId, hit }));
  return { data, meta: meta(overrides) };
}

export function peoplePage(
  hits: PersonHit[],
  overrides: Partial<WorkspaceSearchMeta> = {},
): WorkspaceSearchPage {
  const data: SearchRow[] = hits.map((hit) => ({ type: 'people', key: hit.userId, hit }));
  return { data, meta: meta(overrides) };
}

export function meetingPage(
  hits: MeetingHit[],
  overrides: Partial<WorkspaceSearchMeta> = {},
): WorkspaceSearchPage {
  const data: SearchRow[] = hits.map((hit) => ({ type: 'meetings', key: hit.meetingId, hit }));
  return { data, meta: meta(overrides) };
}

export const EMPTY_PAGE: WorkspaceSearchPage = { data: [], meta: META };
