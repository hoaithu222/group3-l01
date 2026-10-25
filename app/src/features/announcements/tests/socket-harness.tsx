import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { io } from 'socket.io-client';

import { announcementKeys } from '../api/announcements.keys';
import type { AnnouncementView } from '../api/announcements.types';
import { makeView } from './fixtures';

/** Dùng chung cho các test của `useAnnouncementSocket` (tách hai file để mỗi file dưới trần 200 dòng). */
export const LIST_KEY = announcementKeys.channel('ch-1');

interface MockSocket {
  __emitServer: (event: string, payload?: unknown) => void;
}

/** Đọc lúc gọi (không phải lúc nạp module): `io()` chỉ chạy khi `@/core/socket` được nạp. */
const serverSocket = () =>
  (io as jest.MockedFunction<typeof io>).mock.results[0]?.value as MockSocket;

/** Server phát một sự kiện tới app, trong `act`. */
export const emit = (event: string, payload: unknown) =>
  act(async () => serverSocket().__emitServer(event, payload));

export function setupSocketHook(
  list: AnnouncementView[] = [makeView({ canViewReceipts: true, confirmedCount: 12 })],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(LIST_KEY, list);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

export const readList = (queryClient: QueryClient) =>
  queryClient.getQueryData<AnnouncementView[]>(LIST_KEY);
