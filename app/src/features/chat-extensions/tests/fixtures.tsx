import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';
import { AxiosError } from 'axios';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { chatKeys } from '@/features/chat';
import { makeData, makeMessage as makeChatMessage } from '@/features/chat/cache/apply-socket-event.fixtures';
import type { MessageExtensionMessage, MessageExtensionScope, MessagePollView } from '@/shared/message-extensions';

import type {
  ReminderView,
  ScheduledMessageView,
} from '../api/chat-extensions.types';

/** ⚠️ `Screen`/`AppBar`/`BottomSheet` gọi `useSafeAreaInsets()` — ném lỗi nếu thiếu provider. */
const SAFE_AREA_METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

export function makeQueryClient(): QueryClient {
  // `mutations.gcTime: Infinity`: mặc định 5 PHÚT — timer đó giữ vòng lặp sự kiện của Jest (chạy một suite là treo tới khi hết hạn, chạy nhiều suite thì worker bị ép thoát).
  return new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Infinity, retry: false },
      queries: { gcTime: Infinity, retry: false, staleTime: 0 },
    },
  });
}

/** Cho React Query đẩy kết quả vào React trong `act` (nó báo observer qua `setTimeout(0)`). */
export const flushQuery = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

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
export function apiError(status: number, code: string, details?: unknown): AxiosError {
  return new AxiosError(`HTTP ${status}`, 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: { success: false, error: { code, message: code, ...(details ? { details } : {}) } },
    headers: {},
    status,
    statusText: '',
  });
}

export const SCOPE: MessageExtensionScope = { scopeId: 'ch-1', scopeType: 'CHANNEL', workspaceId: 'ws-1' };

export function makePoll(overrides: Partial<MessagePollView> = {}): MessagePollView {
  return {
    anonymous: false,
    canClose: false,
    canViewVoters: false,
    closeReason: null,
    closesAt: null,
    id: 'p-1',
    messageId: 'msg-poll',
    multi: false,
    myOptionIds: [],
    options: [
      { id: 'a', percent: 50, text: 'Phở', voteCount: 1 },
      { id: 'b', percent: 50, text: 'Bún', voteCount: 1 },
    ],
    question: 'Ăn gì trưa nay?',
    scopeId: 'ch-1',
    scopeType: 'CHANNEL',
    status: 'OPEN',
    version: 3,
    voterCount: 2,
    ...overrides,
  };
}

export function makePollMessage(overrides: Partial<MessageExtensionMessage> = {}): MessageExtensionMessage {
  return {
    authorId: 'u-author',
    content: 'Ăn gì trưa nay?',
    deleted: false,
    id: 'msg-poll',
    kind: 'POLL',
    myPermissions: { canModerate: false },
    poll: makePoll(),
    threadId: null,
    ...overrides,
  };
}

/** Cache tin nhắn của phòng `SCOPE` chứa MỘT tin khảo sát — nơi PollCard/`usePollVote`/`usePollSocket` đọc và vá. */
export function seedPollCache(queryClient: QueryClient, poll: MessagePollView = makePoll()): void {
  queryClient.setQueryData(
    chatKeys.messages(SCOPE),
    makeData([{ data: [makeChatMessage({ id: poll.messageId, kind: 'POLL', poll })] }]),
  );
}

export function makeScheduled(overrides: Partial<ScheduledMessageView> = {}): ScheduledMessageView {
  return {
    attachments: [],
    content: 'Nhớ nộp báo cáo',
    createdAt: '2026-09-25T00:00:00.000Z',
    failCode: null,
    failReason: null,
    id: 's-1',
    mentions: [],
    messageId: null,
    replyToId: null,
    scopeId: 'ch-1',
    scopeLabel: 'Kênh Chung',
    scopeType: 'CHANNEL',
    sendAt: '2026-10-01T13:00:00.000Z',
    status: 'PENDING',
    threadId: null,
    timezone: 'Asia/Ho_Chi_Minh',
    version: 1,
    ...overrides,
  };
}

export function makeReminder(overrides: Partial<ReminderView> = {}): ReminderView {
  return {
    id: 'r-1',
    messageId: 'm-1',
    preview: 'Họp lúc 9h',
    remindAt: '2026-10-01T13:00:00.000Z',
    scopeId: 'ch-1',
    scopeType: 'CHANNEL',
    status: 'PENDING',
    timezone: 'Asia/Ho_Chi_Minh',
    unavailable: false,
    ...overrides,
  };
}

/** Trang cursor như BE trả (`{ data, meta }`). */
export function cursorPage<T>(data: T[], meta: Partial<{ nextCursor: string | null; hasMore: boolean }> = {}) {
  return { data, meta: { hasMore: false, limit: 30, nextCursor: null, ...meta } };
}
