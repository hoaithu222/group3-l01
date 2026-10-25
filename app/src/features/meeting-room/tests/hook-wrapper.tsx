import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * Đồ dùng chung cho test HOOK của `meeting-room`. KHÔNG phải test (`testMatch` chỉ nhận `*.test.ts(x)`).
 * `gcTime: Infinity` + mutation `gcTime: 0`: không để hẹn giờ 5 phút giữ tiến trình Jest.
 */
export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      mutations: { gcTime: 0, retry: false },
      queries: { gcTime: Infinity, retry: false, staleTime: 0 },
    },
  });
}

export function makeWrapper(client: QueryClient = makeTestQueryClient()) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** Nhường vi tác vụ đủ để chuỗi `await` của controller chạy hết (không dùng timer thật). */
export async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}

/** Lỗi axios có cấu trúc `{ error: { code, details } }` như BE trả. */
export function apiError(status: number, code: string, details?: unknown) {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { data: { error: { code, details, message: code } }, headers: {}, status },
  });
}

/**
 * Cho React Query báo kết quả bằng VI TÁC VỤ thay vì `setTimeout(0)`: `act` nhường vi tác vụ nên mọi cập nhật của hook rơi TRONG act — không còn
 * cảnh báo "not wrapped in act" chập chờn do timer báo trễ. Gọi ở đầu file test (đăng ký `beforeAll`/`afterAll` của file đó).
 */
export function installMicrotaskQueryNotifications(): void {
  beforeAll(() => notifyManager.setScheduler((callback) => queueMicrotask(callback)));
  afterAll(() => notifyManager.setScheduler((callback) => setTimeout(callback, 0)));
}
