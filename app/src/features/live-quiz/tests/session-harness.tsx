import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { io } from 'socket.io-client';

import '@/core/socket';

import { liveQuizKeys } from '../api/live-quiz.keys';
import { liveQuizService } from '../api/live-quiz.service';
import type { LiveQuizSnapshot } from '../api/live-quiz.types';
import { useLiveQuizSession } from '../hooks/useLiveQuizSession';

/**
 * Khung dùng chung cho các test của `useLiveQuizSession`: snapshot mẫu, mock socket (`__emitServer`), dựng hook với
 * QueryClient riêng. Không phải test — tách ra để mỗi file test ≤ 200 dòng (trần của `check:file-size`).
 */

interface MockSocket {
  __emitServer: (event: string, payload?: unknown) => void;
}
const mockSocket = (io as jest.MockedFunction<typeof io>).mock.results[0]?.value as MockSocket;

export const SERVER_NOW = 1_800_000_000_000;
export const OPTIONS = [
  { mediaAssetId: null, text: 'Hà Nội' },
  { mediaAssetId: null, text: 'Huế' },
];

export const snapshot = (overrides: Partial<LiveQuizSnapshot> = {}): LiveQuizSnapshot => ({
  currentIndex: 0,
  hostId: 'u-host',
  id: 's1',
  leaderboardTop: [],
  me: { cumulativeMs: 900, rank: 4, score: 500, userId: 'u-me' },
  phase: 'LOBBY',
  players: [{ avatarAssetId: null, nickname: 'Tôi', userId: 'u-me' }],
  question: null,
  serverNow: SERVER_NOW,
  status: 'WAITING',
  total: 3,
  version: 1,
  ...overrides,
});

const getSpy = jest.spyOn(liveQuizService, 'get');

let queryClient: QueryClient;

/** Snapshot đang nằm trong cache React Query của phiên `s1`. */
export const cache = () =>
  queryClient.getQueryData<LiveQuizSnapshot>(liveQuizKeys.session('s1')) as LiveQuizSnapshot;

export async function setupSession(initial: LiveQuizSnapshot = snapshot()) {
  getSpy.mockResolvedValue(initial);
  queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const view = await renderHook(() => useLiveQuizSession('s1'), { wrapper });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  return view;
}

export async function emit(event: string, payload: unknown): Promise<void> {
  await act(async () => {
    mockSocket.__emitServer(event, payload);
    // React Query gom thông báo bằng setTimeout(0) — chờ nó xong TRONG act (không thì cảnh báo act nổ sau ca kiểm).
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}
